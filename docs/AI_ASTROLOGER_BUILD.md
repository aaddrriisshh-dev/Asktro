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
Assemble once per person, cache, feed as plain labeled text, e.g.:
```
LAGNA: Vrishchik (Scorpio)
MOON: Karka (Cancer), 4th house
CURRENT MAHADASHA: Shukra (until 2027-03); ANTARDASHA: Budh (until 2026-08)
CURRENT TRANSIT: Shani in 10th house (career), Guru in 2nd
YOGAS PRESENT: Gajakesari; DOSHAS: none detected
```
Rule fed to the model: *only name factors that appear here; verify before naming.*

## Provider strategy (model-agnostic)
One adapter interface; models switchable by config:
- **Reading tier:** Gemini 2.5 Pro (recommended) or Claude Sonnet — blind-tested on
  real Hindi/Hinglish prompts.
- **Filler / extractor tier:** Gemini 2.5 Flash (cheap, great Indic).
- Prompt caching on the (static) persona + chart facts → 0.1× after turn 1.

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
1. **LLM API key** (the one blocker to wiring it live). Recommend **Gemini** (2.5
   Pro + Flash). Set as Firebase secrets: `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`
   if we go Claude). I'll default to Gemini unless vetoed.
2. Confirm **Prokerala plan has credit budget** (already integrated; birth-details/
   kundli endpoints cost ~tens of credits each — trivial).
3. Model choice sign-off (recommend Gemini 2.5 Pro reading tier) — vetoable.
