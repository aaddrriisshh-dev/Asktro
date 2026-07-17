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

const IST_MS = 5.5 * 3600 * 1000;
const HISTORY_TURNS = 10;
const CHART_CACHE = 'chart'; // consultations/{id}/ai/{CHART_CACHE}

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

      const [aSnap, uSnap] = await Promise.all([
        db.collection('astrologers').doc(c.astrologerId).get(),
        db.collection('users').doc(c.customerId).get(),
      ]);
      const astro = aSnap.data();
      if (!astro || astro.isAI !== true) return; // only AI personas auto-reply
      const user = uSnap.data() ?? {};

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

      // 2) History + opening detection.
      const history = await loadHistory(consultationId, c.astrologerId, snap.id);
      const isSessionOpening = !history.some((t) => t.role === 'model');

      // 3) Intent → 4) slice → 5) persona system prompt.
      const intent = classifyIntentHeuristic(text);
      const briefing = assembleSlice(chart, {
        themes: intent.themes,
        subIntent: intent.subIntent,
        gender: user.gender === 'female' ? 'female' : user.gender === 'male' ? 'male' : undefined,
      });
      const system = buildReadingSystem({
        astrologer: {
          name: astro.name ?? astro.displayName ?? 'Guru ji',
          age: typeof astro.age === 'number' ? astro.age : undefined,
          gender: astro.gender === 'female' ? 'female' : astro.gender === 'male' ? 'male' : undefined,
          style: astro.persona ?? astro.bio ?? undefined,
        },
        client: {
          name: firstName(user.name),
          age: ageFromMs(user.birthDateMs),
          gender: user.gender === 'female' ? 'female' : user.gender === 'male' ? 'male' : undefined,
        },
        language: undefined, // auto-mirror per the persona rules
        briefing,
        isSessionOpening,
      });

      // 6) Reading model + 7) grounding guard (one repair, then refuse).
      const envelope = await generateGrounded(system, history, text, briefing, apiKey, configModels);
      if (!envelope) return;

      // 8) Write the reply bubble(s) as the astrologer.
      for (const bubble of envelope.messages) {
        if (!bubble.trim()) continue;
        await db.collection('consultations').doc(consultationId).collection('messages').add({
          senderId: c.astrologerId,
          type: 'text',
          text: bubble,
          timestamp: FieldValue.serverTimestamp(),
          delivered: true,
          seen: false,
          aiGenerated: true,
        });
      }
      logger.info('onAiChatMessage: replied', {
        consultationId,
        themes: intent.themes,
        subIntent: intent.subIntent,
        action: envelope.action,
        confidence: envelope.confidence,
        bubbles: envelope.messages.length,
      });
    } catch (e) {
      logger.error('onAiChatMessage failed', {
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

async function loadHistory(
  consultationId: string,
  astrologerId: string,
  currentMsgId: string,
): Promise<LlmTurn[]> {
  const q = await db
    .collection('consultations')
    .doc(consultationId)
    .collection('messages')
    .orderBy('timestamp', 'desc')
    .limit(HISTORY_TURNS + 4)
    .get();
  const turns: LlmTurn[] = [];
  for (const d of q.docs) {
    if (d.id === currentMsgId) continue;
    const m = d.data();
    const t = String(m.text ?? '').trim();
    if (!t || m.type === 'image') continue;
    const role: LlmTurn['role'] = m.senderId === astrologerId ? 'model' : 'user';
    turns.push({ role, text: t });
    if (turns.length >= HISTORY_TURNS) break;
  }
  return turns.reverse(); // chronological
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
