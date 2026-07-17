# Asktro AI Astrologer — Engine & Retention Spec (living doc)

_Status: **design discussion, not yet built.** This captures decisions made with
the founder so any session has the full context. Update it as we go._

**Current app state:** the AI astrologer shows as available and chat-only, but
there is **no reply engine** — it's just an astrologer doc with `isAI: true`.
Typing a message gets no automatic answer yet. Building this engine is the next
big feature. (The earlier "make AI busy" gating was reverted; AI stays available.)

---

## Vision
Make the AI astrologer feel like a **real human astrologer** — paced, warm,
short, relationship-driven. Never a bot that dumps a wall of text. The goal is
"this feels like *my* astrologer," not "this is a chatbot."

---

## Locked decisions
1. **Typing time IS billed.** Per-minute model; the human-like pauses are billed
   like a real astrologer's time. Guardrail: pacing must stay **believably
   human, never obviously padded** — padded delays make a quick buck then churn,
   which kills the retention engine. Real pacing serves revenue *and* retention.
2. **Per-minute pricing = ₹9/min (LIVE, already built).** New users get a
   **₹27 welcome credit = 3 free minutes** — granted in `onUserCreate.ts` as
   `welcomeBonus = config.freeChatMinutes (3) × consultationPricePerMinutePaise
   (900)`, dropped into the non-withdrawable `chatBonusBalance` (spent first). The
   app nudges a recharge at the **2-minute mark**, before the free 3 min run out.
   The billing timer should start on the **first real AI reply**, not chat-open.
   (This "free taste → paid" is exactly the funnel the market research pointed to.)
3. **Never funnel AI users to a human astrologer.** The AI is a first-class
   product and revenue center, not a lead-gen loss-leader. The close keeps the
   relationship warm ("come back, your stars are shifting") + a soft **store /
   remedy upsell** (gemstone, pooja, report) — never "go talk to a real one."
4. **Model:** **Gemini Pro for the readings** (quality = the "real astrologer"
   feel), **Gemini Flash for filler turns** (greetings, clarifiers, small talk).
   Concrete model IDs locked (Jul 2026, all tested-good on our funded key):
   **readings = `gemini-pro-latest`**, **filler = `gemini-flash-latest`** (both
   auto-current aliases); pinned fallbacks `gemini-3.1-pro-preview` /
   `gemini-3.5-flash` if we ever freeze behavior. Adapter is config-driven, so
   swapping is one line. Still worth a blind-test **Gemini Pro vs Claude Sonnet**
   on real Hindi/Hinglish + real Prokerala data before final sign-off.
   Grounding/prompting matters ~60%, the model ~40%.
5. **Architecture rule (non-negotiable):** **Prokerala CALCULATES the chart; the
   LLM only INTERPRETS.** Never let the LLM compute placements — that's the
   "hallucinated planet" failure of cheap apps. Feed clean **labeled facts**, not
   raw JSON.

---

## Chat workflow (human-astrologer feel)
1. **Opening ritual** — Namaste 🙏 + name + "let me look at your kundli…" with the
   typing indicator running a few seconds *before* the first words appear.
2. **Gather before you give** — ask 1–2 clarifying questions (career / marriage /
   health?) before the reading. Feels human, grounds the answer, extends the
   session naturally.
3. **The reading** — **HARD CAP 2–3 lines, one insight per bubble.** Gradual
   reveal (occasionally 2 short bubbles with a pause). Warm, personal, uses the
   name, **mirrors the user's language** (Hindi / Hinglish / English, auto-detect).
4. **Pacing engine (core requirement):**
   `delay = thinking-pause + (characters × per-char-time)`, with floor + ceiling,
   all **portal-tunable knobs** so the feel is dialed without a rebuild.
   - Thinking pause: ~1.5–3s normal; ~3–5s before a *reading* ("consulting the chart").
   - Typing: ~80–100 ms/char (~60–70 wpm).
   - Caps: floor ~2s, ceiling ~12–15s per bubble.
   - Typing indicator runs the whole delay; the bubble appears only at the end.
5. **Close** — keep the relationship warm + soft store/remedy upsell. **No human
   referral.**

### Turn-taking & message handling (the 99%-human layer)
This is what separates "an AI that answers" from "a person who converses":
- **One beat per turn.** Usually 1 bubble (occasionally 2), 2–3 lines, then STOP
  and hand the conversation back. Reveal the reading **gradually across the
  user's turns** — withhold, hook, wait for "aur bataiye," then go deeper. (Also
  lengthens the engaged per-minute session.)
- **Never fire multiple bubbles then go silent** — that burst is the #1 AI tell.
- **Aggregate the user's message burst (debounce).** Real users type in fragments
  and mistype then correct. Wait a short settle window (~3–5s, longer if the last
  message looks unfinished — no end punctuation / trailing), resetting the timer
  while messages keep arriving. Only when the user clearly stops, read the WHOLE
  burst together as one turn and answer the complete intent. *(Fixes the WhatsApp
  bug where the AI answered only the first message and ignored the correction.)*
- **Cancel-and-reread on interruption.** If the AI is mid "typing" (delay running)
  and a new user message lands, cancel the pending reply and re-read the full set
  — like a human who stops to read your new message.
- **Realistic typing rhythm** (the pacing engine): thinking pause + typing
  indicator + length-proportional delay.
- **Aim 99%, not 100%.** Occasional terse replies ("haan, bilkul"), sometimes ask
  instead of answer, slightly loose structure — a flawless, perfectly-structured
  reply every time is itself an AI tell.
- **Kill the AI tells:** no markdown/bullets/emojis, no essays, no repeated
  openings/closings (repetition = the biggest tell), no summarizing the user's
  question back, no "is there anything else", no instant replies, emotion answered
  before astrology, never re-introduce or re-ask known info, never break character.

### Engine engineering rules (root causes from the WhatsApp prompt audit)
The founder's WhatsApp model (Claude Haiku) had wrong predictions + broken
messaging + high cost. Root causes and the fixes we build in from day one:
1. **Grounding contract (fixes wrong predictions).** Positive rule, not just "don't
   invent": *"You may name a planet/house/sign/nakshatra/yoga/dosha/dasha/transit
   ONLY if it appears verbatim in the KUNDLI DATA block. Verify before naming. If
   the needed data isn't there, say so in-character — never fill the gap."* Feed
   Prokerala data as **clean labeled facts, not raw JSON**. Confidence is about
   tone, not always having an answer — **honesty outranks sounding certain.**
2. **Output envelope (fixes broken multi-message + routing).** The model returns a
   parseable envelope: `{ "messages": ["…","…"], "action": "READY" |
   "REQUEST_SECONDARY_KUNDLI" | "REQUEST_CLARIFICATION" | … }`. Each `messages`
   string is pure Hinglish (no markdown/JSON) rendered as one bubble with the
   typing delay. Resolves the old contradiction (prose-only vs. return-actions).
3. **Backend owns timing math.** Compute the active dasha/transit window server-side
   and pass it as a fact; don't make the model do date arithmetic.
4. **Cost controls.** Cache the (static) system prompt + kundli → 0.1× after turn 1;
   trim history to a rolling window (~8–10 turns) + a short running summary; cap
   output length. (The old "always send full history, no caching" spec is what ate
   money on Haiku.)
5. **Model.** Gemini Pro / Claude Sonnet for readings (Haiku was too weak for real
   judgment); Flash for filler. Blind-test on real Hindi/Hinglish prompts.
6. **Keep the good bones:** the founder's 16-module "constitution" (identity,
   personality, ethics, emotional intelligence, edge cases, decision engine) is a
   strong base — reuse it, de-duplicated and slimmed, with the fixes above.

---

## Cost & margin (verified inputs; see the spec artifact)
- **Prokerala:** one chart call per user, **cached** (~50 credits ≈ ₹0.80; Ruby
  $19/mo = 100k credits ≈ ~2,000 charts). Not called per message.
- **LLM per message**, done right (prompt caching + output cap): Haiku ~₹0.36,
  Sonnet ~₹1.1–1.4, Gemini Pro mid-tier (cheaper than Sonnet). Done **wrong**
  (no caching, full JSON every message, verbose output): ~₹4.5+/msg — this is the
  "it ate up money" failure the founder hit on WhatsApp with Haiku.
- **Per-minute @ ₹9/min (live rate)**, done right: Sonnet cost ~₹2/min → **~78%
  margin**; Gemini Pro ~₹1.2–1.5/min → **~83–87%**; Haiku ~92% (too weak, skip).
  Uncontrolled (no caching, verbose, Opus) can still go negative — controls matter.
- **The free 3 min costs ~₹6 of LLM** (Sonnet), not ₹27 — ₹27 is notional bonus
  credit, not cash. Cheap hook for an engaged user who then pays ₹9/min.
- **The four cost controls that decide profit vs loss:** (1) **prompt caching**
  (chart + system prompt read at 0.1×), (2) **cap output length**, (3) **trim
  history** to last ~8–10 messages, (4) **rate-limit** the AI (no 4 replies in
  60s). Without these, per-minute AI billing goes negative.
- Haiku was found **too weak for real astrological judgment** — use Sonnet / Gemini
  Pro for the interpretation tier.

---

## Retention engine (to detail thoroughly later — may matter more than the chat engine)
- **"Continue your reading" cards** on the home screen — astrologer's face,
  last-message preview, one-tap re-entry. Highest-leverage retention surface.
- **Favorite / "Your Astrologers"** row — users adopt *their* astrologer.
- **Cross-session memory (the killer feature):** the astrologer *remembers* past
  conversations ("last time we spoke about your interview — how did it go?").
  Turns "an AI chat" into "**my** astrologer." First thing to design in the
  deep-dive: the **memory model** — what's remembered, for how long, stored
  cheaply per user.
- **Proactive nudges:** daily/weekly personalized push *from your astrologer*
  → opens a billed session. Personal, not a generic horoscope blast.
- **Life-event triggers:** a real dasha/transit change fires a grounded nudge
  ("Saturn just entered your career house — let's talk").
- **Streaks / daily ritual** check-in.
- **The loop:** favorite → remembered relationship → grounded nudges pull them
  back → "continue" cards → paced, billed chat → repeat.

---

## Pacing & typing engine — build spec (founder requirements, locked)
The persona enforces "one beat, then wait"; the PACING ENGINE (client + server,
portal-tunable) enforces the human *timing*. Build during live wiring:
1. **Message aggregation / debounce.** If the user fires 2-3 messages one by one
   (fragments, mistypes, corrections), PAUSE and wait for the burst to settle
   (~3-5s; longer if the last message looks unfinished — no end punctuation),
   resetting the timer while messages keep arriving; then read the WHOLE burst and
   answer once. Never answer only the first message.
2. **Cancel-and-reread.** If a new message lands while the AI is already composing
   ("typing"), cancel the pending reply and re-read the full set.
3. **Thinking pause before replying.** ~1.5-3s for small talk; ~3-5s before a real
   reading ("consulting the chart").
4. **Typing indicator (dots).** Show the "…" animation the WHOLE time the pause +
   typing runs; the bubble appears only at the end.
5. **Realistic typing speed.** Duration ∝ message length, like a person typing a
   2-line message — ~60-80 ms/char (≈45-60 wpm). Floor ~2s, ceiling ~12-15s/bubble.
6. **One bubble per turn** (occasionally two, each with its own pause + dots — never
   a simultaneous dump), then STOP and wait.
7. Guardrail: believably human, NEVER obviously padded (padding churns users).
   All knobs portal-tunable without a redeploy.

## Open items / next steps
- [x] Pricing confirmed: ₹9/min live + 3 free min (₹27 credit) + 2-min recharge nudge.
- [ ] Blind-test Gemini Pro vs Claude Sonnet on ~50–100 real Hindi/Hinglish prompts.
- [ ] Design the **memory model** (retention deep-dive).
- [ ] Build order once we commit: model-agnostic adapter → Prokerala→facts
      grounding → persona prompt → typing/pacing engine → billing-on-first-reply →
      retention surfaces (continue cards, favorites, memory, nudges).

## Market benchmark (research #2, verified)
- **The market gives AI chat away FREE as lead-gen** — it does NOT meter the bot.
  Ishvaram: free kundali + first AI answer, "no per-minute charges." AstroTalk:
  paid consults are 100% human (per-minute, "First Chat Free") + a *separate free*
  "Astro Chat" AI app. Money is made on human per-minute + paid reports.
- **Human rate ≈ ₹20–50/min** (budget-to-mid). Our **₹9/min** AI sits well below —
  good "affordable, always-on" positioning.
- **Prokerala cost is a rounding error:** birth chart 50 credits ≈ ₹1; free tier
  5,000 credits/mo (~100 charts); Ruby ₹999/mo = 100k credits. **The whole COGS is
  the LLM.**
- **Market is huge & real** (MCA-verified): AstroTalk FY24 ₹659 cr revenue (+132%),
  ₹100 cr profit; Astroyogi ₹85 cr; InstaAstro ₹21 cr; AstroSage ₹60 cr; 50M+
  downloads each.
- **Regulation light:** no dedicated law; astrology exempt from anti-superstition
  / magic-remedies acts. **But ASCI bars "100% guarantee" claims** → always add
  disclaimers, never promise certainty.
- **Report/remedy upsells work:** Ishvaram sells reports at ₹149–199 (Brihat
  Kundali, Marriage, Career, Sade Sati) — adopt this, it doesn't undermine the AI.
- ⚠️ Ignore the viral "AstroSage 90% margins / 25 cr questions / 20% MoM" figures —
  **refuted** in verification.

### Strategic decision (cofounder call)
Charging per-minute for AI is **contrarian** (market gives AI free). It works IF
the AI is genuinely differentiated — the "real human astrologer, paced, remembered"
experience is the justification. Status vs this plan:
- **Free first taste — ALREADY BUILT** (3 free minutes via the ₹27 welcome
  credit + recharge nudge at 2 min). This is the paid-AI funnel, not a human funnel.
- **₹9/min** for engaged sessions (below the ₹20–50/min human rate).
- **Add report/remedy upsells** (₹149–199) as a second revenue line — not built yet.
- Margin ~78% on Sonnet / ~85% on Gemini Pro with the four cost controls.

## Research references
- Spec + cost artifact: _AI Astrologer Engine: Spec & Cost Research_ (Claude artifact).
- Research #1 (done): architecture, Prokerala pricing, Claude/Gemini/GPT token costs.
- Research #2 (running): competitor AI-chat pricing + operational-cost benchmark —
  fold results into "Cost & margin" and confirm the ₹5/min price point.
