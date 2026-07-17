# Asktro AI Astrologer — Engineering Build Plan (CTO blueprint)

_Companion to `AI_ASTROLOGER_ENGINE.md` (vision, decisions, pricing, retention).
This doc is the technical build: architecture, contracts, phases, dependencies._

Goal: the **best AI astrologer in the world** — a paced, kundli-grounded, 99%-human
conversation the user never suspects is AI. Zero-bug bar.

---

## What already exists (we build ON this, not from scratch)
- **Prokerala** — `firebase/functions/src/prokerala/prokerala.ts`: `prokeralaGet()`
  internal caller + secrets (`PROKERALA_CLIENT_ID/SECRET`); endpoints:
  `v2/astrology/birth-details`, `kundli`, `kundli/advanced`, `chart` (SVG),
  `kundli-matching`.
- **Consultations & chat** — `consultations/{id}/messages/{msgId}`; the app reads/
  writes messages directly; `onChatMessageCreated` trigger already exists
  (moderation) — our reply generator hooks the same event.
- **Billing** — per-minute engine (`applyTick`, `createConsultation`,
  `activateConsultation`), bonus-credit-first, ₹9/min + 3 free minutes
  (`config/global`: `consultationPricePerMinutePaise: 900`, `freeChatMinutes: 3`),
  recharge nudge at the 2-min mark.
- **AI persona** — an astrologer doc with `isAI: true` (always-online, chat-only,
  already fixed). Missing piece = the reply engine.

## Architecture — the reply pipeline (each stage kills a bug class)
1. **Ingestion + debounce** (Cloud Tasks): a customer message schedules a
   "generate reply" task ~3–5s out; a newer message supersedes it (token). Reads
   the WHOLE settled burst. *Kills "answered the first/wrong message."*
2. **Intent + subject router** (Module 15): self / compatibility / third-person →
   which kundli(s) are needed.
3. **Birth-detail extractor + slot-filler**: LLM (Flash) parses messy free-text
   into `{name,date,time,place}` + confidence; ask only for missing/ambiguous
   slots; never re-send the whole card. *Kills the format loop.*
4. **Kundli service**: `prokeralaGet` per person, geocode place → lat/long/tz,
   cache each chart in `consultations/{id}/kundlis/{personKey}` (never regenerate;
   never overwrite the primary).
5. **Context assembler**: cached persona prompt + **labeled chart facts (not raw
   JSON)** + rolling history (last ~8–10) + running summary + the burst.
   *Kills cost blowup + hallucination.*
6. **LLM interpreter** (Gemini 2.5 Pro / Sonnet): returns the **output envelope**.
7. **Grounding validator**: reject/repair any reply naming a factor absent from the
   chart facts. *Safety net over the prompt — kills wrong predictions.*
8. **Pacing / turn-taking renderer** (client): one beat per turn, typing indicator,
   length-proportional delay, cancel-and-reread on new input.
9. **Billing hook**: start on first real reply; bonus-credit-first.
10. **Memory writer**: per-session + cross-session summary (retention).

## The LLM output contract (the spine)
```json
{
  "messages": ["short hinglish bubble", "optional 2nd"],
  "action": "REPLY | REQUEST_SECONDARY_KUNDLI | REQUEST_THIRD_PERSON_KUNDLI | REQUEST_CLARIFICATION | NONE",
  "person": "wife | fiancé | son | …",
  "confidence": "grounded | partial | insufficient"
}
```
`messages` = pure Hinglish, no markdown/JSON, rendered as bubbles with delays.
`action` drives the input card / routing. `confidence:insufficient` forces the
honest "mujhe aur dekhna hoga" instead of a hallucination.

## Chart-facts format (Prokerala → labeled facts)
Assemble once per person, cache, feed as plain labeled text (built by
`src/ai/chartFacts.ts`, verified against real data — see below).
Rule fed to the model: *only name factors that appear here; verify before naming.*

### ProKerala data mapping — VERIFIED against a real chart (do not re-guess)
Confirmed by pulling a real kundli (founder's, 21-09-1991). Three endpoints, all
via the internal `prokeralaGet()` (bypasses the client proxy whitelist):
- **`v2/astrology/planet-position` @ BIRTH datetime** → natal grahas. Each: `name`,
  `is_retrograde`, `degree`, `rasi:{id,name,lord}`, and `position`. **10 entries =
  9 grahas + `Ascendant`** (the Ascendant entry gives the Lagna sign).
- **`v2/astrology/planet-position` @ CURRENT datetime** → **gochar** (transits).
  Same shape; the ONLY difference is the datetime. This is how we get "what's
  happening now" + Sade Sati.
- **`v2/astrology/kundli/advanced`** → `nakshatra_details`, `mangal_dosha`,
  `yoga_details[].yoga_list[]` (`has_yoga`), and the full `dasha_periods` tree
  (maha→antar→pratyantar, each with `start`/`end` ISO). ~246 KB.

**⚠️ THE `position` TRAP (root-cause bug class — a WhatsApp failure mode):**
`position` is the sign's NATURAL zodiac number (Aries=1 … Pisces=12), **NOT the
house from the Lagna.** Proof: the Ascendant reports `position:9` (Sagittarius)
when its house is by definition 1. Houses MUST be computed:
`house = ((signId − lagnaSignId + 12) % 12) + 1` (whole-sign; rasi `id` is
0-indexed). Trusting `position` as the house makes every placement wrong.

- **Dasha:** resolve the active period by walking the tree and comparing
  `start`/`end` to now (backend owns the timing math — never the LLM).
- **Gochar houses** counted from natal Moon (`houseFromMoon`); Sade Sati = Saturn
  in the 12th/1st/2nd from Moon (rising/peak/setting phase).

Actual rendered output for the real chart (this is what the model reads):
```
LAGNA (Ascendant): Sagittarius (Dhanu)
MOON (rashi): Aquarius (Kumbha), 3rd house — Nakshatra Dhanishta pada 4
PLANETS (natal — house counted from Lagna):
- Saturn: Capricorn (Makara), 2nd house, 6.6° (retrograde)   [NOT house 10]
- Sun/Mars: Virgo, 10th; Mercury/Jupiter: Leo, 9th; Venus: Cancer, 8th; …
CURRENT DASHA: Jupiter (Guru) → Rahu → Venus
GOCHAR (from natal Moon): Saturn Pisces 2nd → SADE SATI ACTIVE (final phase); …
YOGAS PRESENT: Gajakesari, Raja Yoga, Anapha, Vasi, Daridra
DOSHAS: none detected
```

## Provider strategy (model-agnostic) — 3-tier routing = the cost lever
One adapter interface; each turn routes to the CHEAPEST model that can do the job,
so the premium brain only fires on real readings (~30–40% of turns). Models by
config; IDs locked Jul 2026 (all tested-good on the funded Asktro key):
- **Tier 3 — Readings (the brain):** `gemini-pro-latest` (fallback
  `gemini-3.1-pro-preview`). The grounded kundli interpretation — the moments that
  must feel like a real astrologer. Premium, but rare.
- **Tier 2 — Filler / conversation:** `gemini-flash-latest` (fallback
  `gemini-3.5-flash`). Greetings, clarifiers, small talk, "let me check…". Cheap.
- **Tier 1 — Router / extractor:** `gemini-flash-lite-latest`. Intent detection
  (self/compat/third-person) + parsing messy birth details into clean slots.
  Cheapest; mechanical.
- Prompt caching on the (static) persona + chart facts → 0.1× after turn 1; capped
  output length; rolling ~8–10-turn history window. These four controls decide
  profit vs loss. **Infra ready:** ₹1,000 prepay on `asktro-tech-provate-limited`,
  key confirmed live.

## Phased plan
- **Phase 0 — Foundations:** provider adapter + secrets; persona prompt v4
  (slimmed constitution + grounding contract, portal-editable); chart-facts
  assembler; envelope parser + grounding validator. → *Deliverable: message +
  facts + history → grounded reply envelope, testable in isolation.*
- **Phase 1 — Live loop:** hook `messages` onCreate → debounce (Cloud Tasks) →
  generate → write bubbles; billing on first reply; client pacing/typing render.
  → *Deliverable: a real, paced, correctly-billed AI chat.*
- **Phase 2 — Multi-kundli:** intent router + input card (pickers) + LLM
  slot-filler + multi-chart store. → *Deliverable: compatibility / third-person
  with no format loops.*
- **Phase 3 — Memory & retention:** cross-session memory, continue cards,
  favourites, nudges.
- **Phase 4 — Polish & scale:** caching, cost telemetry, moderation guardrails,
  a blind quality-eval harness, load test.

## Dependencies I need from the founder
1. ~~**LLM API key**~~ ✅ **RESOLVED (Jul 2026).** Gemini key live on
   `asktro-tech-provate-limited` with ₹1,000 prepay credit; Flash + Pro tiers
   tested. Remaining wiring step: drop the key value into the `GEMINI_API_KEY`
   Firebase secret (new version) at the moment we deploy Phase 1 — not before, so
   it isn't sitting around unused.
2. Confirm **Prokerala plan has credit budget** (already integrated; birth-details/
   kundli endpoints cost ~tens of credits each — trivial).
3. ~~Model choice sign-off~~ ✅ Locked: `gemini-pro-latest` readings /
   `gemini-flash-latest` filler / `gemini-flash-lite-latest` router. Vetoable via
   config; blind-test vs Sonnet still open before final sign-off.
