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
2. **Per-minute pricing, target ~₹5/min** (benchmark pending 2nd research). The
   billing timer starts on the **first real AI reply**, not on chat-open.
3. **Never funnel AI users to a human astrologer.** The AI is a first-class
   product and revenue center, not a lead-gen loss-leader. The close keeps the
   relationship warm ("come back, your stars are shifting") + a soft **store /
   remedy upsell** (gemstone, pooja, report) — never "go talk to a real one."
4. **Model:** **Gemini Pro for the readings** (quality = the "real astrologer"
   feel), **Gemini Flash for filler turns** (greetings, clarifiers, small talk).
   Blind-test **Gemini Pro vs Claude Sonnet** on real Hindi/Hinglish prompts +
   real Prokerala data before finalizing the premium model. Grounding/prompting
   matters ~60%, the model ~40%.
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

---

## Cost & margin (verified inputs; see the spec artifact)
- **Prokerala:** one chart call per user, **cached** (~50 credits ≈ ₹0.80; Ruby
  $19/mo = 100k credits ≈ ~2,000 charts). Not called per message.
- **LLM per message**, done right (prompt caching + output cap): Haiku ~₹0.36,
  Sonnet ~₹1.1–1.4, Gemini Pro mid-tier (cheaper than Sonnet). Done **wrong**
  (no caching, full JSON every message, verbose output): ~₹4.5+/msg — this is the
  "it ate up money" failure the founder hit on WhatsApp with Haiku.
- **Per-minute @ ₹5/min**, ~1.5 msgs/min: Haiku ~85% margin, **Sonnet ~55–65%**,
  Opus ~0/negative. Uncontrolled = negative.
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

## Open items / next steps
- [ ] Confirm ₹5/min vs the market benchmark (2nd deep-research running).
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
- **Human rate ≈ ₹20–50/min** (budget-to-mid). Our ₹5/min AI sits well below —
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
experience is the justification. De-risk it:
- **Free first taste** (first chat / first 2–3 messages free) to hook — a *paid-AI*
  funnel, NOT a human funnel.
- Keep ₹5/min for engaged sessions (below the ₹20–50/min human rate).
- **Add report/remedy upsells** (₹149–199) as a second revenue line.
- Margin holds ~60% on Sonnet with the four cost controls; higher on Gemini.

## Research references
- Spec + cost artifact: _AI Astrologer Engine: Spec & Cost Research_ (Claude artifact).
- Research #1 (done): architecture, Prokerala pricing, Claude/Gemini/GPT token costs.
- Research #2 (running): competitor AI-chat pricing + operational-cost benchmark —
  fold results into "Cost & margin" and confirm the ₹5/min price point.
