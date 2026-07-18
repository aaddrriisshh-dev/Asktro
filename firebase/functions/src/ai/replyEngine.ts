/**
 * Stage 1 — the AI astrologer reply engine (Firestore trigger).
 *
 * Fires on every new chat message. When the message is from the CUSTOMER in a
 * chat with an AI astrologer, it runs the full pipeline:
 *   build/cache chart → intent router → slice selector → persona → reading model
 *   → grounding guard → write the reply bubble(s).
 *
 * Loop guard: we only act on messages whose senderId is the customer; the AI's
 * own writes (senderId === astrologerId) are ignored, so it never answers itself.
 *
 * Pacing (debounce, typing dots, human delays) and billing are Stages 2-3; this
 * stage is "she answers, grounded". Everything is defensive — a failure logs and
 * bows out rather than throwing (a thrown trigger retries and could loop).
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { db, FieldValue } from '../common/admin';
import { getGlobalConfig } from '../common/config';
import { GEMINI_API_KEY } from '../common/secrets';
import { PROKERALA_CLIENT_ID, PROKERALA_CLIENT_SECRET, prokeralaGet } from '../prokerala/prokerala';
import { extractChartData, ChartData } from './chartFacts';
import { assembleSlice } from './selector';
import { classifyIntentHeuristic } from './router';
import { buildReadingSystem } from './persona';
import { llmGenerate, LlmTurn } from './provider';
import { guardReply } from './guard';
import { conjugateGender } from './gender';
import { enforceRateLimit } from '../common/rateLimit';

const IST_MS = 5.5 * 3600 * 1000;
const HISTORY_TURNS = 10;
const CHART_CACHE = 'chart'; // consultations/{id}/ai/{CHART_CACHE}

// Pacing knobs (portal-tunable later). Kept human, never obviously padded.
const DEBOUNCE_MS = 3500; // wait for the user's burst to settle before replying
const JOIN_DELAY_MS = 4000; // "joining…" → "<name> joined" (a real, unhurried arrival)
const GREETING_GAP_MS = 2500; // typing dots before the opening greeting
const TYPE_PER_CHAR_MS = 55; // human typing speed
const TYPE_FLOOR_MS = 1800;
const TYPE_CEIL_MS = 9000;
const MAX_BUBBLES = 2; // she may send at most two short, paced bubbles per reply
const INTER_BUBBLE_MS = 1400; // gap between bubbles so the dots visibly re-appear and it never feels rushed

export const onAiChatMessage = onDocumentCreated(
  {
    document: 'consultations/{consultationId}/messages/{messageId}',
    secrets: [GEMINI_API_KEY, PROKERALA_CLIENT_ID, PROKERALA_CLIENT_SECRET],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const msg = snap.data() ?? {};
    const consultationId = event.params.consultationId;

    let typingAstroId: string | undefined; // to clear the typing dots on error
    try {
      const text = String(msg.text ?? '').trim();
      const senderId = msg.senderId as string | undefined;
      if (!text || msg.type === 'image') return; // nothing to read (Stage 1: text only)

      const cSnap = await db.collection('consultations').doc(consultationId).get();
      const c = cSnap.data();
      if (!c) return;
      if (c.type !== 'chat') return;
      if (['ended', 'cancelled', 'expired'].includes(c.status)) return;
      // LOOP GUARD: only reply to the customer's own messages.
      if (senderId !== c.customerId) return;

      // DEBOUNCE: wait for the user's burst to settle, then only the LAST message
      // proceeds (earlier ones bail) — so 2-3 rapid messages are read together and
      // answered once, never one-by-one.
      await sleep(DEBOUNCE_MS);
      const latestId = await latestCustomerMessageId(consultationId, c.customerId as string);
      if (latestId && latestId !== snap.id) return; // a newer USER message superseded us

      const [aSnap, uSnap] = await Promise.all([
        db.collection('astrologers').doc(c.astrologerId).get(),
        db.collection('users').doc(c.customerId).get(),
      ]);
      const astro = aSnap.data();
      if (!astro || astro.isAI !== true) return; // only AI personas auto-reply
      typingAstroId = c.astrologerId as string;
      const user = uSnap.data() ?? {};
      const clientName = firstName(user.name);

      const apiKey = GEMINI_API_KEY.value();
      if (!apiKey) {
        logger.error('onAiChatMessage: GEMINI_API_KEY not set');
        return;
      }
      const config = await getGlobalConfig();
      const configModels = (config as unknown as Record<string, unknown>).aiModels as
        | Partial<Record<'router' | 'filler' | 'reading', string>>
        | undefined;

      // 1) Chart — build once, cache on the consultation.
      const chart = await getOrBuildChart(consultationId, user);
      if (!chart) {
        logger.warn('onAiChatMessage: no chart (missing birth data?)', { consultationId });
        return; // Stage 1: silently skip; a "share your birth details" flow comes later
      }

      // 2) Aggregate the settled burst + rolling history (system/join messages
      // are excluded from context).
      const { burst, history } = await loadBurstAndHistory(consultationId, c.customerId, c.astrologerId);
      const userText = burst || text;
      const isSessionOpening = !history.some((t) => t.role === 'model');

      // 3) Intent → 4) slice → 5) persona system prompt.
      const intent = classifyIntentHeuristic(userText);
      const briefing = assembleSlice(chart, {
        themes: intent.themes,
        subIntent: intent.subIntent,
        gender: user.gender === 'female' ? 'female' : user.gender === 'male' ? 'male' : undefined,
        overview: intent.overview,
      });
      const astroGender = astro.gender === 'female' ? 'female' : astro.gender === 'male' ? 'male' : undefined;
      const systemBase = buildReadingSystem({
        astrologer: {
          name: astro.name ?? astro.displayName ?? 'Guru ji',
          age: typeof astro.age === 'number' ? astro.age : undefined,
          gender: astroGender,
          style: astro.persona ?? astro.bio ?? undefined,
        },
        client: {
          name: clientName,
          age: ageFromMs(user.birthDateMs),
          gender: user.gender === 'female' ? 'female' : user.gender === 'male' ? 'male' : undefined,
          relationshipStatus: str(user.relationshipStatus),
        },
        language: undefined, // auto-mirror per the persona rules
        briefing,
        isSessionOpening,
      });

      // 5b) Continuity: fold in any recent remedy-thread messages she exchanged
      // with this client OUTSIDE the chat (portal nurture), so she picks up the
      // context ("the bracelet I suggested…"). Best-effort — never blocks a reply.
      const threadCtx = await loadRemedyThreadContext(c.customerId as string, c.astrologerId as string);
      let system = threadCtx
        ? `${systemBase}\n\n# RECENT MESSAGES YOU SENT THIS CLIENT (outside this chat — for continuity; refer to them naturally if relevant, never repeat verbatim)\n${threadCtx}`
        : systemBase;

      // 5c) Cross-session memory (phase 3, light): at the START of a new chat,
      // fold in the tail of the LAST chat with this client so she opens by
      // naturally picking up where they left off ("pichhli baar interview ki
      // baat hui thi — kaisa raha?"). Only at session opening; best-effort.
      if (isSessionOpening) {
        const priorCtx = await loadPriorSessionContext(
          c.customerId as string, c.astrologerId as string, consultationId);
        if (priorCtx) {
          system += `\n\n# LAST TIME WITH THIS CLIENT (your previous chat — open by referencing where you left off, warmly and naturally; never repeat it verbatim, never invent beyond it)\n${priorCtx}`;
        }
      }

      // 5d) Rate-limit premium generations per user so a spamming/scripted client
      // can't push AI cost above revenue. Generous cap; fails open on infra fault.
      // Over the cap → skip this generation (no LLM call), never throw.
      try {
        await enforceRateLimit('aiChatReply', c.customerId as string);
      } catch {
        await setTyping(consultationId, c.astrologerId, false);
        logger.warn('onAiChatMessage: rate-limited, skipping generation', { consultationId });
        return;
      }

      // 6) Show the typing indicator (dots) while she composes, then generate.
      await setTyping(consultationId, c.astrologerId, true);
      const envelope = await generateGrounded(system, history, userText, briefing, apiKey, configModels);
      if (!envelope) {
        await setTyping(consultationId, c.astrologerId, false);
        return;
      }

      // SUPERSEDE: if the user sent a newer message WHILE we were composing (their
      // questions were spaced further apart than the debounce), abandon this reply
      // — the newer message's own run will answer the whole burst. Without this,
      // each spaced-out question spawns its own reply and floods the chat.
      const stillLatest = await latestCustomerMessageId(consultationId, c.customerId as string);
      if (stillLatest && stillLatest !== snap.id) {
        await setTyping(consultationId, c.astrologerId, false);
        logger.info('onAiChatMessage: superseded during generation, skipping', { consultationId });
        return;
      }

      // 7) Up to TWO short bubbles. Strip a leading "<Name> ji," from the FIRST
      // (a robotic tell), trim each to a beat, drop any empties/overflow.
      const consultationRef = db.collection('consultations').doc(consultationId);
      const bubbles = envelope.messages
        .map((m) => m.trim())
        .filter(Boolean)
        .slice(0, MAX_BUBBLES)
        .map((m, i) => trimToBeat(i === 0 ? stripLeadingName(m, clientName) : m))
        .map((m) => conjugateGender(m, astroGender)) // deterministic Hindi gender net
        .filter(Boolean);

      // Abuse toward the astrologer → two warnings, then end the session.
      if (envelope.abuse) {
        const strikes = (num(c.aiAbuseStrikes) ?? 0) + 1;
        await consultationRef.set({ aiAbuseStrikes: strikes, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        if (strikes >= 3) {
          const endMsg = astroGender === 'male'
            ? 'Main is tarah ki baat-cheet aage nahi kar sakta. Yeh session yahin samapt kar raha hoon, apna dhyaan rakhiye.'
            : 'Main is tarah ki baat-cheet aage nahi kar sakti. Yeh session yahin samapt kar rahi hoon, apna dhyaan rakhiye.';
          await setTyping(consultationId, c.astrologerId, true);
          await sleep(typingDelayMs(endMsg));
          await writeAstro(consultationId, c.astrologerId, endMsg);
          await setTyping(consultationId, c.astrologerId, false);
          await consultationRef.set({ status: 'ended', endTime: FieldValue.serverTimestamp(), endReason: 'abuse', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          logger.info('onAiChatMessage: ended session for repeated abuse', { consultationId, strikes });
          return;
        }
        logger.info('onAiChatMessage: abuse warning', { consultationId, strikes });
      }

      if (bubbles.length === 0) {
        await setTyping(consultationId, c.astrologerId, false);
        return;
      }

      // 7b) START BILLING on the FIRST real reply — not on chat-open. The joining
      // ritual + greeting stay free; a user who opens and leaves without engaging
      // is never charged. No-op once the session is already active.
      await activateIfWaiting(consultationId);

      // 8) Send each bubble one at a time — dots, a human typing-delay sized to
      // THAT bubble, then the bubble; a short gap before the next so the dots
      // visibly clear and re-appear (a real person typing successive messages).
      for (let k = 0; k < bubbles.length; k++) {
        await setTyping(consultationId, c.astrologerId, true); // refreshes the dots + freshness
        await sleep(typingDelayMs(bubbles[k]));
        await writeAstro(consultationId, c.astrologerId, bubbles[k]);
        await setTyping(consultationId, c.astrologerId, false);
        if (k < bubbles.length - 1) await sleep(INTER_BUBBLE_MS);
      }

      // 9) A concrete remedy (upay) → a saved remedy card, same as a real
      // astrologer: a saveable `remedies` doc (powers "Your Personal Remedies")
      // + a type:'remedy' chat card. Paced after the bubbles.
      if (envelope.remedy) {
        await setTyping(consultationId, c.astrologerId, true);
        await sleep(typingDelayMs(`${envelope.remedy.title} ${envelope.remedy.note}`));
        await writeRemedy(consultationId, c.customerId as string, c.astrologerId as string, {
          name: str(astro.name ?? astro.displayName) ?? 'Acharya',
          photo: str(astro.profilePhoto),
        }, envelope.remedy);
        await setTyping(consultationId, c.astrologerId, false);
      }

      logger.info('onAiChatMessage: replied', {
        consultationId,
        themes: intent.themes,
        subIntent: intent.subIntent,
        action: envelope.action,
        confidence: envelope.confidence,
        bubbles: bubbles.length,
        remedy: !!envelope.remedy,
      });
    } catch (e) {
      if (typingAstroId) await setTyping(consultationId, typingAstroId, false);
      logger.error('onAiChatMessage failed', {
        consultationId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
);

/**
 * Proactive opening greeting — fires when an AI chat consultation is created, so
 * the astrologer speaks FIRST (the opening ritual) instead of the user staring at
 * silence. Template-based: instant + free (no chart/LLM needed); the chart builds
 * on the user's first real question. Only for AI chat consultations, once each.
 */
export const onAiConsultationCreated = onDocumentCreated(
  { document: 'consultations/{consultationId}' },
  async (event) => {
    const c = event.data?.data();
    const consultationId = event.params.consultationId;
    if (!c || c.type !== 'chat') return;
    try {
      const astro = (await db.collection('astrologers').doc(c.astrologerId).get()).data();
      if (!astro || astro.isAI !== true) return;
      const displayName = String(astro.name ?? astro.displayName ?? 'Acharya');
      // Opening ritual: "joining…" → (same line updates to) "<name> has joined" →
      // typing dots → a SHORT greeting. Updating the SAME status line in place
      // means "joining…" never lingers next to "joined". Never reveals it's AI
      // (name only). All free — billing starts on the user's first reply.
      const joiningRef = await writeSystem(consultationId, 'Astrologer is joining…');
      await sleep(JOIN_DELAY_MS);
      await joiningRef.update({ text: `${displayName} has joined` });
      await setTyping(consultationId, c.astrologerId, true);
      await sleep(GREETING_GAP_MS);
      await writeAstro(consultationId, c.astrologerId, 'Namaste ji! Kaise hain aap?');
      await setTyping(consultationId, c.astrologerId, false);
    } catch (e) {
      // Never leave the typing dots stuck on if the ritual throws mid-way.
      if (c.astrologerId) await setTyping(consultationId, String(c.astrologerId), false);
      logger.error('onAiConsultationCreated failed', {
        consultationId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
);

// ---- chart build + cache ------------------------------------------------

async function getOrBuildChart(
  consultationId: string,
  user: Record<string, unknown>,
): Promise<ChartData | null> {
  const cacheRef = db.collection('consultations').doc(consultationId).collection('ai').doc(CHART_CACHE);
  const cached = await cacheRef.get();
  if (cached.exists && cached.data()?.chart) return cached.data()!.chart as ChartData;

  const lat = num(user.birthLat);
  const lng = num(user.birthLng);
  const birthMs = num(user.birthDateMs);
  if (lat == null || lng == null || birthMs == null) return null;

  const coordinates = `${lat},${lng}`;
  const birthDatetime = birthIso(birthMs, str(user.birthTime), user.birthTimeKnown !== false);
  const nowDatetime = nowIso();
  const clientId = PROKERALA_CLIENT_ID.value();
  const clientSecret = PROKERALA_CLIENT_SECRET.value();

  const [natal, gochar, advanced] = await Promise.all([
    prokeralaGet('v2/astrology/planet-position', { ayanamsa: 1, coordinates, datetime: birthDatetime, la: 'en' }, clientId, clientSecret),
    prokeralaGet('v2/astrology/planet-position', { ayanamsa: 1, coordinates, datetime: nowDatetime, la: 'en' }, clientId, clientSecret),
    prokeralaGet('v2/astrology/kundli/advanced', { ayanamsa: 1, coordinates, datetime: birthDatetime, la: 'en' }, clientId, clientSecret),
  ]);
  if (!natal || !advanced) return null; // gochar optional; natal + advanced are essential

  const chart = extractChartData({
    name: firstName(user.name),
    natalPlanets: (natal as Record<string, unknown>).planet_position,
    gocharPlanets: gochar ? (gochar as Record<string, unknown>).planet_position : undefined,
    advanced: advanced as Record<string, unknown>,
    nowMs: Date.now(),
  });

  // Firestore rejects `undefined` (and throws SYNCHRONOUSLY, so .catch can't help).
  // A JSON round-trip drops every undefined key (optional fields like vedicName,
  // dignity, etc.) — safe because those are all optional and absent == undefined.
  const clean = JSON.parse(JSON.stringify(chart)) as ChartData;
  await cacheRef.set({ chart: clean, builtAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
  return clean;
}

// ---- LLM generate + grounding repair ------------------------------------

async function generateGrounded(
  system: string,
  history: LlmTurn[],
  userText: string,
  briefing: string,
  apiKey: string,
  configModels?: Partial<Record<'router' | 'filler' | 'reading', string>>,
) {
  for (let attempt = 0; attempt <= 1; attempt++) {
    const turns = attempt === 0 ? history : history; // history is stable across the single repair
    const raw = await llmGenerate(
      { tier: 'reading', system, history: turns, userText, json: true },
      apiKey,
      configModels,
    );
    const decision = guardReply(raw, briefing, attempt);
    if (decision.verdict === 'send' || decision.verdict === 'fallback') return decision.envelope!;
    // repair: fold the correction into the next user turn
    userText = `${userText}\n\n[SYSTEM CORRECTION: ${decision.correction}]`;
  }
  return null;
}

// ---- history ------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function typingDelayMs(text: string): number {
  return Math.min(Math.max(text.length * TYPE_PER_CHAR_MS, TYPE_FLOOR_MS), TYPE_CEIL_MS);
}
/** Flip the astrologer's typing indicator (the app already renders the dots). */
async function setTyping(consultationId: string, typerId: string, typing: boolean): Promise<void> {
  await db
    .collection('consultations')
    .doc(consultationId)
    .collection('typing')
    .doc(typerId)
    .set({ typing, at: FieldValue.serverTimestamp() }, { merge: true })
    .catch(() => {});
}
/** A centered system status line (joining / joined). Excluded from LLM context.
 *  Returns the doc ref so the caller can update the SAME line in place (e.g.
 *  "joining…" → "has joined") instead of stacking a second status message. */
async function writeSystem(consultationId: string, text: string) {
  return db.collection('consultations').doc(consultationId).collection('messages').add({
    senderId: 'system',
    type: 'system',
    text,
    timestamp: FieldValue.serverTimestamp(),
    delivered: true,
    seen: true,
  });
}
/**
 * Id of the newest CUSTOMER message — used to bail only when a newer message
 * FROM THE USER superseded us. It ignores the astrologer's OWN replies: a
 * question sent while she is still typing must not be mistaken for "superseded"
 * just because her bubble is the newest doc (that bug made her skip the message
 * until the user nudged with another one).
 */
async function latestCustomerMessageId(consultationId: string, customerId: string): Promise<string | null> {
  const q = await db
    .collection('consultations')
    .doc(consultationId)
    .collection('messages')
    .orderBy('timestamp', 'desc')
    .limit(12)
    .get();
  for (const d of q.docs) {
    if ((d.data() as Record<string, unknown>).senderId === customerId) return d.id;
  }
  return null;
}
/**
 * Aggregate the user's settled burst (the trailing run of their own messages
 * since the last astrologer turn) + the rolling history before it. Image/system
 * messages are excluded from context.
 */
async function loadBurstAndHistory(
  consultationId: string,
  customerId: string,
  astrologerId: string,
): Promise<{ burst: string; history: LlmTurn[] }> {
  const q = await db
    .collection('consultations')
    .doc(consultationId)
    .collection('messages')
    .orderBy('timestamp', 'desc')
    .limit(HISTORY_TURNS + 8)
    .get();
  const docs = q.docs.map((d) => d.data() as Record<string, unknown>);
  const usable = (m: Record<string, unknown>): string | null => {
    const t = String(m.text ?? '').trim();
    return t && m.type !== 'image' && m.type !== 'system' ? t : null;
  };
  // Trailing run of the customer's own messages (newest-first) = settled burst.
  const burstParts: string[] = [];
  let i = 0;
  for (; i < docs.length; i++) {
    const t = usable(docs[i]);
    if (docs[i].senderId === customerId && t) burstParts.push(t);
    else break;
  }
  const burst = burstParts.reverse().join('\n').trim();
  // Everything older = rolling history (chronological).
  const history: LlmTurn[] = [];
  for (let j = i; j < docs.length && history.length < HISTORY_TURNS; j++) {
    const t = usable(docs[j]);
    if (!t) continue;
    history.push({ role: docs[j].senderId === astrologerId ? 'model' : 'user', text: t });
  }
  history.reverse();
  return { burst, history };
}

/**
 * Recent remedy-thread messages this astrologer exchanged with this client from
 * the PORTAL (outside the live chat), for continuity. Returns a short transcript
 * of the most recent threaded remedy, or '' if none. Best-effort: any error → ''.
 */
async function loadRemedyThreadContext(customerId: string, astrologerId: string): Promise<string> {
  try {
    const rem = await db.collection('remedies').where('customerId', '==', customerId).limit(10).get();
    const mine = rem.docs
      .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as Record<string, unknown> & { id: string }))
      .filter((r) => r.astrologerId === astrologerId && r.threadLastAt)
      .sort((a, b) => tsMs(b.threadLastAt) - tsMs(a.threadLastAt));
    if (!mine.length) return '';
    const top = mine[0];
    const thread = await db
      .collection('remedies').doc(top.id).collection('thread')
      .orderBy('createdAt', 'desc').limit(6).get();
    const lines = thread.docs
      .map((d) => d.data() as Record<string, unknown>)
      .reverse()
      .map((m) => {
        const who = m.senderRole === 'astrologer' ? 'You' : 'Client';
        const hook = m.hook && typeof m.hook === 'object'
          ? ` [you suggested: ${str((m.hook as Record<string, unknown>).title) ?? 'a product'}]` : '';
        return `${who}: ${String(m.text ?? '').slice(0, 200)}${hook}`;
      });
    if (!lines.length) return '';
    return `Remedy "${str(top.title) ?? 'upay'}":\n${lines.join('\n')}`;
  } catch {
    return '';
  }
}
/**
 * Light cross-session memory: the tail (~last 6 text messages) of this client's
 * most recent PRIOR chat with the same astrologer. Lets a new session open by
 * referencing where they left off. Read-only, best-effort; no new writes/index
 * (reuses the customerId+createdAt query the app already uses).
 */
async function loadPriorSessionContext(
  customerId: string,
  astrologerId: string,
  currentConsultationId: string,
): Promise<string> {
  try {
    const snap = await db
      .collection('consultations')
      .where('customerId', '==', customerId)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    const prior = snap.docs
      .filter((d) => d.id !== currentConsultationId)
      .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as Record<string, unknown> & { id: string }))
      .filter((c) => c.astrologerId === astrologerId && (c.type === 'chat' || c.type == null));
    if (!prior.length) return '';
    const top = prior[0]; // newest-first from the ordered query
    const msgs = await db
      .collection('consultations').doc(top.id).collection('messages')
      .orderBy('timestamp', 'desc').limit(6).get();
    const lines = msgs.docs
      .map((d) => d.data() as Record<string, unknown>)
      .reverse()
      .filter((m) => m.type === 'text' || m.type == null)
      .map((m) => `${m.senderId === astrologerId ? 'You' : 'Client'}: ${String(m.text ?? '').slice(0, 200)}`)
      .filter((l) => l.length > 8);
    return lines.length ? lines.join('\n') : '';
  } catch {
    return '';
  }
}

/**
 * Start billing exactly when the AI posts its FIRST real reply. Flips a `waiting`
 * AI session to `active` and seeds the meter (startTime/lastTickAt) + the customer
 * billing-frontier marker to now — mirroring activateConsultation, but triggered
 * by the reply rather than by chat-open. Idempotent: only acts while `waiting`,
 * so later messages are no-ops. Best-effort — a failure just defers billing.
 */
async function activateIfWaiting(consultationId: string): Promise<void> {
  try {
    const ref = db.collection('consultations').doc(consultationId);
    await db.runTransaction(async (tx) => {
      const d = (await tx.get(ref)).data();
      if (!d || d.status !== 'waiting') return; // already active/paused/terminal
      tx.update(ref, {
        status: 'active',
        startTime: FieldValue.serverTimestamp(),
        lastTickAt: FieldValue.serverTimestamp(),
        customerLastTickAt: FieldValue.serverTimestamp(),
        paymentStatus: 'pending',
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (e) {
    logger.error('activateIfWaiting failed', {
      consultationId, error: e instanceof Error ? e.message : String(e),
    });
  }
}

function tsMs(v: unknown): number {
  return v && typeof (v as { toMillis?: () => number }).toMillis === 'function'
    ? (v as { toMillis: () => number }).toMillis() : 0;
}

// ---- helpers ------------------------------------------------------------

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
function firstName(v: unknown): string | undefined {
  const s = str(v);
  return s ? s.split(/\s+/)[0] : undefined;
}
function ageFromMs(v: unknown): number | undefined {
  const ms = num(v);
  if (ms == null) return undefined;
  const years = (Date.now() - ms) / (365.25 * 24 * 3600 * 1000);
  return years > 0 && years < 120 ? Math.floor(years) : undefined;
}
function two(n: number): string {
  return String(n).padStart(2, '0');
}
/** Safety net: keep a bubble to ~2 sentences / WhatsApp length even if the model runs long. */
function trimToBeat(text: string): string {
  const t = text.trim();
  if (t.length <= 240) return t;
  const sentences = t.split(/(?<=[.!?।])\s+/).filter(Boolean);
  const out: string[] = [];
  let len = 0;
  for (const s of sentences) {
    if (out.length >= 2) break;
    if (out.length >= 1 && len + s.length > 260) break;
    out.push(s);
    len += s.length + 1;
  }
  let res = out.join(' ').trim() || t;
  if (res.length > 300) res = res.slice(0, 300).replace(/\s+\S*$/, '').trim();
  return res;
}

/**
 * Strip a leading "<Name> ji," / "<Name>," address so she doesn't open every
 * reply with the client's name (a robotic tell). Only removes it when there's
 * real content after it; leaves warm terms like "beta"/"Mataji" untouched.
 */
function stripLeadingName(text: string, name?: string): string {
  const t = text.trim();
  if (!name) return t;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${esc}\\s*(ji|jee)?\\s*[,:.\\-–—]?\\s+`, 'i');
  const stripped = t.replace(re, '');
  return stripped && stripped !== t ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : t;
}

/**
 * Write a remedy exactly like a real astrologer does: (1) a saveable `remedies`
 * doc that powers the customer's "Your Personal Remedies" screen, tagged isAI so
 * a later follow-up routes to the portal (not a human astrologer app); (2) a
 * type:'remedy' chat message so the gold remedy card shows inline in the chat.
 */
async function writeRemedy(
  consultationId: string,
  customerId: string,
  astrologerId: string,
  astro: { name: string; photo?: string },
  remedy: { title: string; note: string },
): Promise<void> {
  const title = remedy.title || 'Remedy';
  const note = remedy.note || '';
  await db.collection('remedies').add({
    customerId,
    astrologerId,
    astrologerName: astro.name,
    astrologerPhoto: astro.photo ?? null,
    consultationId,
    title,
    note,
    done: false,
    isAI: true,
    createdAt: FieldValue.serverTimestamp(),
  }).catch(() => {});
  await db.collection('consultations').doc(consultationId).collection('messages').add({
    senderId: astrologerId,
    type: 'remedy',
    title,
    note,
    text: note ? `${title}\n${note}` : title,
    timestamp: FieldValue.serverTimestamp(),
    delivered: true,
    seen: false,
    aiGenerated: true,
  });
}

/** Write one astrologer text bubble to a consultation. */
async function writeAstro(consultationId: string, astrologerId: string, text: string): Promise<void> {
  await db.collection('consultations').doc(consultationId).collection('messages').add({
    senderId: astrologerId,
    type: 'text',
    text,
    timestamp: FieldValue.serverTimestamp(),
    delivered: true,
    seen: false,
    aiGenerated: true,
  });
}
/** Birth ISO in IST from an epoch-ms date + optional HH:mm. Matches the app. */
function birthIso(birthMs: number, birthTime: string | undefined, timeKnown: boolean): string {
  const d = new Date(birthMs + IST_MS); // shift to IST, read UTC parts
  const date = `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
  let hh = '12', mm = '00';
  if (timeKnown && birthTime && birthTime.includes(':')) {
    const [h, m] = birthTime.split(':');
    hh = two(Number(h));
    mm = two(Number(m));
  }
  return `${date}T${hh}:${mm}:00+05:30`;
}
function nowIso(): string {
  const d = new Date(Date.now() + IST_MS);
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}T${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:00+05:30`;
}
