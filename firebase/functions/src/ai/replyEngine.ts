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
import { buildNumerologyBriefing, computeNumerology, NumerologyFacts } from './numerology';
import { buildTarotBriefing } from './tarot';
import { classifyIntentHeuristic } from './router';
import {
  buildReadingSystem, PersonaFlavor, Tradition, Verbosity, LanguageLean, RemedyStyle,
} from './persona';
import { llmGenerate, LlmTurn, LlmInlineImage } from './provider';
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
const RECALL_PAUSE_MS = 2600; // the "reading our last chat" pause after the beat, before she recalls

// Vision read of a client photo. Gemini accepts inline images up to ~20MB; we cap
// tighter — a chat photo is small, and a giant payload just burns tokens/latency.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// Stand-in "burst" when the client sent ONLY a photo (no words) — the model still
// needs a final user turn; the actual image rides alongside as an inline part.
const PHOTO_ONLY_TEXT = '(the client has shared a photo with you, without any words)';
// A Vastu consultant has no chart or numbers to ground on — the "facts" are the
// client's own space, which the persona gathers by asking. This just frames it.
const VASTU_BRIEFING =
  'This is a VASTU (spatial) consultation — there is no birth chart or number to read. '
  + 'Ground your guidance in the client\'s SPACE: ask for the home / main-door facing '
  + 'direction or the specific room/corner in question, then advise by direction and '
  + 'placement with simple, doable corrections.';
// Folded into the system prompt only when a photo is attached. Keeps her in
// character, steers each photo type sensibly, and protects the computed kundli
// from being overridden by an unverifiable chart screenshot.
const IMAGE_ADDENDUM = `

# THE CLIENT HAS SHARED A PHOTO WITH YOU
- Look at the attached image and react to what you ACTUALLY see, warmly and in character. NEVER say you "can't see images", "can't open photos", or anything that hints you are an AI/system — a real astrologer simply looks.
- Keep it to your usual 1–2 short bubbles. Do NOT narrate the image clinically ("I see a photo of…"); respond as a person naturally would.
- READ THE SPECIFIC IMAGE, never a generic template. First genuinely observe the concrete details of THIS picture, then base your words on those exact observations — a specific reading is what makes you real; a vague "achhe yog hain" that could fit any photo is the giveaway.
- If it's a PALM (hasta rekha): actually trace the lines you see on THIS hand — note which are long/short, deep/faint, clear/broken or chained, straight/curved (jeevan rekha, hriday rekha, mastishk/head rekha, bhagya rekha), the mounts, the overall hand shape. Give a CONFIDENT, specific reading built on at least ONE concrete thing you actually SEE ("aapki hriday rekha kaafi lambi aur gehri hai — rishton mein aap dil se judte hain"), never a generic palm comment. The palm reading STANDS ON ITS OWN — do NOT say the kundli is "better", the "deeper guide", or that you need the chart to answer; that undercuts your own reading and is forbidden. Only if it genuinely fits may you OFFER to ALSO cross-check with their birth chart as a complement ("chaahein to hum ise aapki kundli se bhi milaa sakte hain") — as an addition, never a replacement, and never in a way that dismisses the palm.
- If TWO palm photos are shown, they are the client's TWO hands — read them TOGETHER and compare. Convention: the non-dominant hand shows what they were BORN with (inborn potential/destiny), the dominant hand shows the PRESENT — what they've made of it. Where the two lines differ, that difference is itself the insight (they've shaped their path). Weave one concrete comparison, don't list both hands mechanically.
- If it's a FACE (samudrik shastra): pick ONE specific feature you actually see (forehead, brow, eyes, nose, chin, jawline) and read it respectfully. NEVER comment on attractiveness, weight, age, skin, or anyone's body.
- If it's a KUNDLI / birth-chart SCREENSHOT: acknowledge it, but rely on THE KUNDLI DATA already given to you for this person — do NOT read planetary positions off a screenshot you cannot verify, and never contradict the computed chart.
- If it's an OBJECT / gemstone / rudraksha / deity / temple / place: name what it actually is and respond meaningfully — a short blessing or guidance tied to their question or chart.
- If the image is UNCLEAR, blurry, cropped, blank, or unrelated to a reading: gently say what's missing and ask, in one line, for a clearer photo or what they'd like you to look at ("photo thoda dhundhla hai, ek saaf photo bhej dijiye"). Never bluff detail you cannot make out.
- Never claim to see detail that isn't there, and never invent chart placements from a picture.`;

// Folded in when the client entered via the Palmistry skill — keeps her palm-led
// so a palm reading never happens without the palm.
const PALMISTRY_NOTE = `

# THIS IS A PALM READING (HASTA REKHA) SESSION
The client came specifically for a PALM reading, which works from their HAND PHOTO.
- If they have shared a hand photo, READ IT per the photo rules above — that is the reading.
- If they have NOT shared a hand photo yet, warmly and specifically ask them to send a clear photo of their RIGHT (dominant) hand — palm facing the camera, fingers a little apart, in good light — before giving a deep reading. You may briefly acknowledge their question, but a palm reading needs the palm, so guide them to the photo first.
- After reading one hand, you may invite the OTHER hand for a deeper two-hand reading.
- Do NOT give a full palm reading without a hand photo, and never fall back to "the kundli is better".`;

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
      const isImageMsg = msg.type === 'image';
      // Proceed on a text message OR a photo (she now looks at what the client
      // shares). Only a genuinely empty, non-image message is nothing to read.
      if (!text && !isImageMsg) return;

      const cSnap = await db.collection('consultations').doc(consultationId).get();
      const c = cSnap.data();
      if (!c) return;
      if (c.type !== 'chat') return;
      // Never generate a (free) AI reply on a terminal OR paused session. A chat
      // pauses when the wallet is exhausted; if the customer keeps typing without
      // recharging, the AI must stay silent until they resume (resumeConsultation
      // on recharge flips it back to active) — otherwise the reading is free.
      if (['ended', 'cancelled', 'expired', 'paused'].includes(c.status)) return;
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

      // 1) Grounding facts by SCHOOL. Vedic/KP/Lal-Kitab read the birth CHART; a
      // numerologist reads the person's NUMBERS; a tarot reader the CARDS drawn
      // for the question (built at step 3, once we have the question); a Vastu
      // consultant runs a spatial consultation (no chart/number needed). Compute
      // the persona flavour once and branch on the school.
      // A skill the user entered via ("Browse by skill") OVERRIDES the astrologer's
      // default discipline for THIS session — so a Vedic astrologer who also offers
      // Numerology actually runs numerology when reached via the Numerology tile,
      // never a generic kundli reading. Palmistry is a photo overlay (handled
      // separately below), so it does NOT replace the chart discipline. Overriding
      // `tradition` here propagates to BOTH the grounding branch and the persona
      // method block (buildReadingSystem reads flavor.tradition).
      const baseFlavor = readFlavor(astro);
      const reqSkill = str(c.requestedSkill);
      const DISCIPLINE_OVERRIDE: Tradition[] = ['numerology', 'tarot'];
      const flavor = reqSkill && (DISCIPLINE_OVERRIDE as string[]).includes(reqSkill)
        ? { ...(baseFlavor ?? {}), tradition: reqSkill as Tradition }
        : baseFlavor;
      const tradition = flavor?.tradition ?? 'vedic';
      let chart: ChartData | null = null;
      let altBriefing: string | null = null; // non-chart schools' facts block
      if (tradition === 'numerology') {
        altBriefing = buildNumerologyBriefing(num(user.birthDateMs), str(user.name));
        if (!altBriefing) {
          logger.warn('onAiChatMessage: no numbers (missing birth date?)', { consultationId });
          return;
        }
      } else if (tradition === 'vastu') {
        altBriefing = VASTU_BRIEFING; // spatial consultation — no birth data needed
      } else if (tradition === 'tarot') {
        altBriefing = null; // the spread is drawn at step 3 from the question
      } else {
        chart = await getOrBuildChart(consultationId, user);
        if (!chart) {
          logger.warn('onAiChatMessage: no chart (missing birth data?)', { consultationId });
          return; // Stage 1: silently skip; a "share your birth details" flow comes later
        }
      }

      // 2) Aggregate the settled burst + rolling history (system/join messages
      // are excluded from context). A photo in the burst is carried as imageUrl.
      const { burst, history, imageUrls } = await loadBurstAndHistory(consultationId, c.customerId, c.astrologerId);

      // If the client shared photo(s), fetch them for a vision read (up to two —
      // e.g. both palms). On any failure (already removed by the NSFW sweep, too
      // large, network) that image is dropped; we fall back to answering the words
      // — or stay silent if there were none, rather than bluffing about a photo we
      // couldn't load.
      const imageInlines = (await Promise.all(imageUrls.map(fetchInlineImage)))
        .filter((x): x is LlmInlineImage => x !== null);
      if (!burst && imageInlines.length === 0) return;

      const userText = burst || (imageInlines.length ? PHOTO_ONLY_TEXT : text);
      const isSessionOpening = !history.some((t) => t.role === 'model');

      // 3) Intent → 4) slice → 5) persona system prompt. Non-chart schools skip the
      // chart slice: a tarot reader draws the spread for THIS question now; the
      // others already have their facts block (numbers / Vastu).
      const intent = classifyIntentHeuristic(userText);
      // Tarot draw gating: the reader reveals the spread ONLY after the client taps
      // "Open my cards" (the chip sends a "cards khol dijiye" cue) — which they can
      // only do AFTER sending their question. Before that, she holds the cards and
      // just invites them to focus + tap. The draw is seeded by the CONSULTATION
      // only, so the three cards are FIXED for the session (no reshuffle per
      // question). `tarotDrawn` on the consultation keeps them revealed thereafter.
      const tarotDrawNow = tradition === 'tarot' && userText.toLowerCase().includes('cards khol');
      const tarotRevealed = tradition === 'tarot' && (c.tarotDrawn === true || tarotDrawNow);
      if (tarotDrawNow && c.tarotDrawn !== true) {
        await db.collection('consultations').doc(consultationId)
          .set({ tarotDrawn: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      const TAROT_AWAIT_DRAW =
        'THE CARDS ARE NOT DRAWN YET. The client is forming or has just sent their ' +
        'question. In ONE warm line, acknowledge their question and tell them to tap ' +
        'the "Open my cards" button below when they are ready to draw. Do NOT name, ' +
        'reveal, or hint at any card yet.';
      const briefing = tradition === 'tarot'
        ? (tarotRevealed ? buildTarotBriefing(consultationId, '') : TAROT_AWAIT_DRAW)
        : (altBriefing ?? assembleSlice(chart!, {
            themes: intent.themes,
            subIntent: intent.subIntent,
            gender: user.gender === 'female' ? 'female' : user.gender === 'male' ? 'male' : undefined,
            overview: intent.overview,
          }));
      const astroGender = astro.gender === 'female' ? 'female' : astro.gender === 'male' ? 'male' : undefined;
      const systemBase = buildReadingSystem({
        astrologer: {
          name: astro.name ?? astro.displayName ?? 'Guru ji',
          age: typeof astro.age === 'number' ? astro.age : undefined,
          gender: astroGender,
          // `about` is the field the portal actually writes; persona/bio kept as
          // legacy fallbacks. Feeds the free-text style line in the identity block.
          style: str(astro.persona) ?? str(astro.bio) ?? str(astro.about) ?? undefined,
          flavor,
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

      // 5c) Cross-session memory (phase 3, light): on the user's FIRST message of
      // this chat, fold in the tail of the LAST chat with this client so she opens
      // by naturally picking up where they left off ("pichhli baar interview ki
      // baat hui thi — kaisa raha?"). We gate on "no user turn yet" — NOT on
      // isSessionOpening, which is always false here because the automated greeting
      // ("Namaste ji…") is itself an astrologer turn in history. Best-effort.
      const isFirstUserTurn = !history.some((t) => t.role === 'user');
      // Set when we will DETERMINISTICALLY post the "let me look at our last chat"
      // beat before she recalls (so the model can never skip it).
      let deterministicBeat = false;
      if (isFirstUserTurn) {
        const { text: priorCtx, count: priorCount } = await loadPriorSessionContext(
          c.customerId as string, c.astrologerId as string, consultationId);
        if (priorCtx) {
          const acquainting = priorCount < 3; // regular (3+) skips the formal beat
          // Does the client want to CONTINUE the last topic? Understood robustly —
          // any phrasing ("purani baat karte hain", "main wahin atka hoon", …) — via
          // keywords first, then a cheap Flash read for whatever the keywords miss.
          if (acquainting) {
            deterministicBeat = await wantsToContinue(userText, apiKey, configModels);
          }
          const recallRule = !acquainting
            ? `- This is a REGULAR client — you know them. Recall naturally and proactively, no formal "let me check my notes". Reference the ongoing thread warmly but with your usual measured dignity — never slangy, never word-for-word.`
            : deterministicBeat
              ? `- You have JUST said "ek minute, hamari pichli baat dekh loon" to them. So NOW, without repeating that, bring up the specific earlier topic SOFTLY as a question ("pichli baar shaadi ki baat hui thi na — us par kuch aage badha?"). Never word-for-word, never a cold perfect recital.`
              : `- If they ask about the earlier topic, bring it up SOFTLY as a question, never word-for-word. If they ask something new, just answer that.`;
          system += `\n\n# YOUR LAST CHAT WITH THIS CLIENT (context — they were already greeted based on how well you know them)
${recallRule}
- If they ask something NEW: answer that; bring the past in only if genuinely relevant, don't force it.
- Never recite these messages verbatim, never invent beyond them.
${priorCtx}`;
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

      // 5e) The human RECALL BEAT — posted deterministically (never left to the
      // model) when a returning-but-still-acquainting client asks to continue: she
      // says "ek minute, pichli baat dekh loon…", pauses as if reading her notes,
      // THEN composes the specific recall below. Template line → zero LLM cost.
      if (deterministicBeat) {
        const beat = conjugateGender(recallBeatLine(), astroGender);
        await setTyping(consultationId, c.astrologerId, true);
        await sleep(typingDelayMs(beat));
        await writeAstro(consultationId, c.astrologerId, beat);
        await setTyping(consultationId, c.astrologerId, false);
        await sleep(RECALL_PAUSE_MS);
      }

      // 5f) If a photo is attached, fold in the vision instructions so she looks
      // at it and reacts IN CHARACTER (never "I can't see images"), while still
      // trusting the computed kundli over any chart screenshot she can't verify.
      if (imageInlines.length) system += IMAGE_ADDENDUM;
      // The client came via the Palmistry skill → keep her palm-led: read the hand
      // photo if present, else warmly ask for it before reading. Never a palm
      // reading without the palm.
      if (c.requestedSkill === 'palmistry') system += PALMISTRY_NOTE;

      // 6) Show the typing indicator (dots) while she composes, then generate.
      await setTyping(consultationId, c.astrologerId, true);
      const envelope = await generateGrounded(
        system, history, userText, briefing, apiKey, configModels,
        imageInlines.length ? imageInlines : undefined,
      );
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
      const astroGender = astro.gender === 'female' ? 'female' : astro.gender === 'male' ? 'male' : undefined;
      // Personalise + detect a RETURNING client (cheap reads, no LLM). A returning
      // client gets a warm "welcome back — continue where we left off, or something
      // new?" opener; she never asserts the old topic here (that lands softly only
      // if they choose to continue). A first-timer gets a simple warm greeting.
      const userData = (await db.collection('users').doc(c.customerId).get()).data() ?? {};
      const first = firstName(userData.name) ?? '';
      // The session's discipline for the OPENER: a skill entered via a tile
      // overrides the persona's default (so a Numerology-tagged Vedic astrologer
      // opens numerology-led), else the astrologer's own tradition.
      const reqSkill = str(c.requestedSkill);
      const openFlavor = readFlavor(astro);
      const discipline = reqSkill && ['numerology', 'tarot'].includes(reqSkill)
        ? reqSkill : (openFlavor?.tradition ?? 'vedic');
      // How many times they've chatted with THIS astrologer before → drives how
      // familiar the opener is (stranger → acquaintance → regular).
      const priorCount = (await loadPriorSessionContext(
        c.customerId as string, c.astrologerId as string, consultationId)).count;
      // Opening ritual: "joining…" → (same line updates to) "<name> has joined" →
      // typing dots → the greeting. Updating the SAME status line in place means
      // "joining…" never lingers next to "joined". Never reveals it's AI (name only).
      // All free — billing starts on the user's first reply.
      const joiningRef = await writeSystem(consultationId, 'Astrologer is joining…');
      await sleep(JOIN_DELAY_MS);
      await joiningRef.update({ text: `${displayName} has joined` });
      await setTyping(consultationId, c.astrologerId, true);
      await sleep(GREETING_GAP_MS);
      // Skill-led openers. Palmistry asks for the hand first (never a reading
      // without the palm). Numerology CONFIRMS the details we hold and reveals the
      // core numbers in TWO short beats (with a typing pause between). Tarot invites
      // the client to focus a question and draw. Everything else gets the normal
      // relationship-stage greeting.
      if (reqSkill === 'palmistry') {
        await writeAstro(consultationId, c.astrologerId, conjugateGender(palmOpeningGreeting(first), astroGender));
      } else if (discipline === 'numerology') {
        const nf = computeNumerology(num(userData.birthDateMs), str(userData.name));
        const beats = numerologyOpeningGreeting(first, str(userData.name) ?? '', nf);
        for (let i = 0; i < beats.length; i++) {
          if (i > 0) {
            await setTyping(consultationId, c.astrologerId, true);
            await sleep(typingDelayMs(beats[i]));
          }
          await writeAstro(consultationId, c.astrologerId, conjugateGender(beats[i], astroGender));
        }
      } else if (discipline === 'tarot') {
        await writeAstro(consultationId, c.astrologerId, conjugateGender(tarotOpeningGreeting(first), astroGender));
      } else {
        await writeAstro(consultationId, c.astrologerId, conjugateGender(openingGreeting(first, priorCount), astroGender));
      }
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
  images?: LlmInlineImage[],
) {
  for (let attempt = 0; attempt <= 1; attempt++) {
    const turns = attempt === 0 ? history : history; // history is stable across the single repair
    const raw = await llmGenerate(
      // Vision reads keep the provider safety layer ON (disableSafety:false) so an
      // explicit photo is blocked → null → the engine stays silent, rather than
      // being described. Text-only calls stay BLOCK_NONE (persona owns boundaries).
      { tier: 'reading', system, history: turns, userText, json: true,
        images, disableSafety: images?.length ? false : undefined },
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

// Obvious "continue the previous topic" phrasings (Latin + Devanagari). A fast,
// free first pass — anything not caught here falls through to a Flash read.
const CONTINUE_LATIN = /(pichhl|pichl|puran|pehl|wahin|wahi baat|wahi topic|jahan ruk|jaha ruk|jahan cho|jaha cho|jahan chh|atk|us baat|usi baat|aage badha|aage kar|aage le|aage bhad|continue|wahi se|wahin se|last waali|pichle)/i;
const CONTINUE_DEV = /(पिछल|पुरान|पहले|वहीं|वही बात|जहां रुक|जहां छोड|जहाँ रुक|जहाँ छोड|अटक|उस बात|उसी बात|आगे बढ़ा|आगे कर|आगे ले|वहीं से|पिछले)/;

/**
 * Does the client want to CONTINUE the previous conversation (vs. ask something
 * new)? Robust to any phrasing: obvious keywords are caught free; anything else is
 * read by a cheap Flash call that actually understands the sentence. Fails safe to
 * false (no beat) on any error, so it never blocks or delays a reply on a fault.
 */
async function wantsToContinue(
  userText: string,
  apiKey: string,
  configModels?: Partial<Record<'router' | 'filler' | 'reading', string>>,
): Promise<boolean> {
  const t = userText.toLowerCase();
  if (CONTINUE_LATIN.test(t) || CONTINUE_DEV.test(userText)) return true;
  try {
    const raw = await llmGenerate(
      {
        tier: 'router',
        system: 'A returning client was just asked whether to CONTINUE the previous conversation or start something NEW. Read their reply (Hindi/Hinglish/English) and answer with ONLY one word — CONTINUE or NEW. If genuinely unclear, answer NEW.',
        userText,
        maxOutputTokens: 4,
      },
      apiKey,
      configModels,
    );
    return /continue/i.test(String(raw ?? ''));
  } catch {
    return false;
  }
}

/** The "let me look at our last chat" beat — varied so it isn't identical each time. */
function recallBeatLine(): string {
  const opts = [
    'Thik hai, ek minute — hamari pichli baat zara dekh loon…',
    'Achha, ek pal rukiye — pichli baar kya baat hui thi, dekh leti hoon…',
    'Ji, ek minute — aapki pichli baat par ek nazar daal loon…',
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

/**
 * The opening line, scaled by RELATIONSHIP STAGE so the reentry evolves instead of
 * repeating the same gesture (repetition is the biggest AI tell):
 *  - priorCount 0  → first time: a simple warm greeting.
 *  - priorCount 1–2 → getting acquainted (2nd–3rd visit): a warm "welcome back"
 *    that offers to continue OR start fresh; she never asserts the old topic here.
 *  - priorCount 3+  → familiar / regular (4th+ visit): warm & proactive, but still
 *    the measured, dignified astrologer register — no chummy slang, name used
 *    sparingly with "ji", references their life/continuity gracefully.
 * Each stage is varied across a few phrasings so it is never word-for-word identical.
 */
function openingGreeting(first: string, priorCount: number): string {
  const name = first ? ` ${first}` : '';
  const nameJi = first ? ` ${first} ji` : ' ji';
  const pick = (opts: string[]): string => opts[Math.floor(Math.random() * opts.length)];

  if (priorCount >= 3) {
    // Regular — warm, proactive, dignified. Never "arre", name sparing.
    return pick([
      `Namaste${nameJi}. Bahut dinon baad aana hua… sab kushal-mangal to hai?`,
      `Aaiye${nameJi}. Kahiye, aajkal jeevan mein kya chal raha hai?`,
      `Namaste${nameJi}. Aapko dekh kar accha laga — pichli baar jo baat chal rahi thi, ab uska kya rukh hai?`,
      `Kahiye${nameJi}, aajkal samay kaisa ja raha hai aapka?`,
    ]);
  }
  if (priorCount >= 1) {
    // Getting acquainted — welcome-back + the choice.
    return pick([
      `Namaste${name}, wapas dekh kar accha laga. Boliye — aaj kuch naya poochna hai, ya pichli baar jahan hamari baat ruki thi, wahin se aage badhein?`,
      `Aaiye${nameJi}, phir mile — accha laga. Bataiye, aaj koi nayi baat hai, ya pichli baat wahin se aage le chalein?`,
      `Namaste${nameJi}. Aap phir aaye, accha laga. Kuch naya mann mein hai, ya jahan pichli baar ruke the wahin se shuru karein?`,
    ]);
  }
  // First time.
  return pick([
    `Namaste${nameJi}! Kaise hain aap?`,
    `Namaste${name}, aaiye. Boliye, aaj kis baare mein jaanna chahenge?`,
    `Namaste${nameJi}. Bataiye, kya chal raha hai aaj-kal?`,
  ]);
}

/** Palm-reading opener — used when the client entered via the Palmistry skill.
 *  Greets warmly AND asks for the RIGHT (dominant) hand photo first, so a palm
 *  reading never begins without the palm. Varied so it isn't identical each time. */
function palmOpeningGreeting(first: string): string {
  const nameJi = first ? ` ${first} ji` : ' ji';
  const opts = [
    `Namaste${nameJi}. Chaliye aapki hasta rekha se shuru karte hain — apne daaye (seedhe) haath ki ek saaf photo bhej dijiye, hatheli camera ki taraf, ungliyan thodi khuli, achhi roshni mein.`,
    `Namaste${nameJi}, aaiye. Sabse pehle aapke haath dekhte hain — daaye haath ki ek saaf photo bhej dijiye, hatheli saamne, ungliyan thodi faila kar.`,
    `Namaste${nameJi}. Aapki rekhaayein padhne ke liye, apne seedhe (daaye) haath ki ek clear photo bhej dijiye — achhi roshni mein, hatheli camera ki taraf.`,
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

const NUM_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Numerology opener — used when the client entered via the Numerology tile OR the
 *  astrologer IS a numerologist. It CONFIRMS the details we already hold (no
 *  re-asking) and reveals the core numbers, in TWO short beats, then hands the mic
 *  to the client. Names + DOB stay in Latin script even inside the Hindi sentence
 *  (never transliterated). The **…** spans render bold in the chat. Returns one
 *  message if the birth date is missing (asks for it in a numerologist's voice),
 *  otherwise two. */
function numerologyOpeningGreeting(first: string, fullName: string, nf: NumerologyFacts | null): string[] {
  const nameJi = first ? ` ${first} ji` : ' ji';
  if (!nf) {
    return [
      `Namaste${nameJi} 🙏 Chaliye aapke numbers se aapki numerology padhte hain — bas apni sahi date of birth (DD-MM-YYYY) bhej dijiye.`,
    ];
  }
  const dob = `${nf.day} ${NUM_MONTHS[nf.month - 1]} ${nf.year}`;
  const namePart = fullName ? `, naam **${fullName}**` : '';
  const beat1 = `Namaste${nameJi} 🙏 Aapki details mere paas hain${namePart}, date of birth **${dob}**.`;
  const naamPart = nf.naamank > 0 ? `, aur naam ank banta hai **${nf.naamank}**` : '';
  const beat2 = `Inhi ke hisaab se aapka moolank banta hai **${nf.moolank}**, bhagyank banta hai **${nf.bhagyank}**${naamPart} 🌟 Ab bataiye — kis baare mein jaanna hai?`;
  return [beat1, beat2];
}

/** Tarot opener — used when the client entered via the Tarot tile OR the astrologer
 *  IS a tarot reader. Invites the client to focus their question and draw: the app
 *  shows a "Pull my cards" chip, and typing the question works too. The spread is
 *  drawn server-side (fixed for the session) when the first reading generates. */
function tarotOpeningGreeting(first: string): string {
  const nameJi = first ? ` ${first} ji` : ' ji';
  // Ask for the QUESTION first (that IS the moment of focus). Only AFTER they send
  // it does the app show the "Open my cards" button. The first-person future verb
  // (khulwaungi) is conjugated to the astrologer's gender by conjugateGender.
  const opts = [
    `Namaste${nameJi} 🙏 Ek gehri saans lijiye aur shaant mann se sochiye ki aapko kya poochhna hai. Jab sawaal taiyaar ho jaaye, mujhe bhej dijiye — phir main aapse cards khulwaungi 🔮`,
    `Namaste${nameJi}, swagat hai 🔮 Thoda shaant hoiye aur apne sawaal par dhyaan dijiye. Sawaal taiyaar ho to likh bhejiye — uske baad main aapse cards khulwaungi.`,
  ];
  return opts[Math.floor(Math.random() * opts.length)];
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
): Promise<{ burst: string; history: LlmTurn[]; imageUrls: string[] }> {
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
  // Photos the customer sent in that run don't end the burst; we keep up to the
  // last TWO images (e.g. a two-hand palm reading — left + right) so she can look
  // at both. Collected newest-first, then reversed to chronological below.
  const burstParts: string[] = [];
  const imageUrls: string[] = [];
  const MAX_BURST_IMAGES = 2;
  let i = 0;
  for (; i < docs.length; i++) {
    const d = docs[i];
    if (d.senderId !== customerId) break; // a non-customer message ends the burst
    const t = usable(d);
    if (t) burstParts.push(t);
    else if (d.type === 'image' && typeof d.image === 'string' && imageUrls.length < MAX_BURST_IMAGES) {
      imageUrls.push(d.image as string);
    }
    // other non-text customer messages are skipped but don't terminate the burst
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
  return { burst, history, imageUrls: imageUrls.reverse() }; // chronological
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
 * most recent PRIOR chat with the same astrologer, plus how MANY prior chats
 * they've had with them (drives the relationship stage of the opener). Read-only,
 * best-effort; no new writes/index (reuses the customerId+createdAt query).
 */
async function loadPriorSessionContext(
  customerId: string,
  astrologerId: string,
  currentConsultationId: string,
): Promise<{ text: string; count: number }> {
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
    if (!prior.length) return { text: '', count: 0 };
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
    return { text: lines.length ? lines.join('\n') : '', count: prior.length };
  } catch {
    return { text: '', count: 0 };
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

// Persona-flavour whitelists — only accept values the engine actually understands,
// so a stray/legacy field on an astrologer doc can never inject junk into the
// prompt. Anything unknown is dropped and the persona falls back to its default.
const TRADITIONS: Tradition[] = ['vedic', 'kp', 'lal_kitab', 'nadi', 'numerology', 'tarot', 'vastu'];
const VERBOSITIES: Verbosity[] = ['concise', 'balanced', 'expansive'];
const LANGUAGE_LEANS: LanguageLean[] = ['hindi', 'balanced', 'english'];
const REMEDY_STYLES: RemedyStyle[] = ['gemstones', 'mantras', 'rituals', 'practical', 'minimal'];
const inList = <T extends string>(v: unknown, list: T[]): T | undefined =>
  typeof v === 'string' && (list as string[]).includes(v) ? (v as T) : undefined;

/** Map an astrologer doc's persona fields to a validated PersonaFlavor. Returns
 *  undefined when nothing is set, so a plain astrologer behaves exactly as before.
 *  Best-effort and defensive: unknown enum values are ignored, not passed through. */
function readFlavor(astro: Record<string, unknown>): PersonaFlavor | undefined {
  const p = (astro.persona && typeof astro.persona === 'object' ? astro.persona : astro) as Record<string, unknown>;
  const reg = p.register && typeof p.register === 'object' ? p.register as Record<string, unknown> : undefined;
  const register = reg
    ? { young: str(reg.young), mid: str(reg.mid), senior: str(reg.senior) }
    : undefined;
  const flavor: PersonaFlavor = {
    tradition: inList(p.tradition, TRADITIONS),
    tone: str(p.tone),
    verbosity: inList(p.verbosity, VERBOSITIES),
    languageLean: inList(p.languageLean, LANGUAGE_LEANS),
    remedyStyle: inList(p.remedyStyle, REMEDY_STYLES),
    voice: str(p.voice),
    register: register && (register.young || register.mid || register.senior) ? register : undefined,
  };
  // Collapse to undefined if every knob is empty (keeps the default persona path).
  return Object.values(flavor).some((v) => v !== undefined) ? flavor : undefined;
}

/**
 * Fetch a chat image (a Firebase Storage download URL) and return it as an inline
 * base64 part for the vision model, or null on ANY problem — a missing/removed
 * file (the NSFW sweep may have deleted it first), a non-image, an oversized
 * payload, or a network fault. Best-effort by contract: the reply engine degrades
 * to answering the words (or staying silent), never throws on a bad photo.
 */
async function fetchInlineImage(url: string): Promise<LlmInlineImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!ct.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null;
    return { data: buf.toString('base64'), mimeType: ct };
  } catch {
    return null;
  }
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
