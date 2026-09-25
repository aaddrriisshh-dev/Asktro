# AI Chat Cost Optimization

> Working doc for keeping the AI astrologer sustainable at scale. Founder is
> scaling ads (100 → 1,000+ users/day), so cost-per-reply must stay low WITHOUT
> hurting reading quality. Updated 2026-09-25.

## Where the money actually goes (Sept 2026, ~600 users)

Google Cloud bill this month ≈ ₹7k, split:

| Line | Cost | Note |
|---|---|---|
| **SMS OTP (Identity Platform)** | **₹4,802** | 718 SMS × ₹6.69 — the real bleed; scales linearly |
| **Gemini API** | **₹2,059** | the AI product itself |
| Secret Manager / App Engine / rest | ~₹400 | negligible |

**Unit economics today:** CAC ₹15–20/user > SMS ₹8/user > **AI ₹2–6/user**. Revenue
≈ ₹2/user, ~2% conversion. So the AI is already the SMALLEST cost — order of
leverage is **conversion → SMS → AI**. Optimize AI for *scale*, not because it's
the current problem.

## Gemini bill by SKU (Sept)

| SKU | Cost |
|---|---|
| Flash 3.6 input (9.2M tok) | ₹661 |
| Flash 3.6 output (1.6M tok) | ₹582 |
| Gemini 3 **Pro** (input+output, "short") | **₹806** ← historical: pre-blackout, before switch to Flash |
| Flash-Lite | ₹0.03 (barely used) |

`config/global.aiModels` is now **100% Flash** (router/filler/reading = `gemini-3.6-flash`).
No Pro going forward. Nothing to fix there.

**Per-1M-token rates (from the real bill):**
| | Input /1M | Output /1M |
|---|---|---|
| Gemini 3 Pro | ₹191 | ₹1,147 |
| **Flash 3.6 (current)** | **₹72** | **₹358** |
| Flash-Lite (est. ~1/3 Flash) | ~₹24 | ~₹120 |

At ~500 users/mo: Pro ≈ ₹3,000, Flash ≈ ₹1,000, Flash-Lite ≈ ₹350.

## Root cost driver on Flash

The **system prompt is 652 lines** (persona.ts 436 + vedic.ts 216) and is sent in
FULL on every reply (`provider.ts:160` — `system_instruction`). That's why input
tokens (9.2M) are ~6× output (1.6M). **Attack the input.**

## Levers (keeping Flash 3.6 — no model switch)

Ranked by value. All backend-only, NO app rebuild.

| Lever | Saving | Quality risk | Status |
|---|---|---|---|
| **1. Cache the system prompt** | ~70–90% off input → ~₹400/mo now, scales linearly | None | measure first (below) |
| **2. Trim the 652-line prompt ~30%** | cuts input on every call, forever | Low if careful | not started |
| **3. Tighter chat history** (already capped, `HISTORY_TURNS`) | medium on long chats | Low | review |
| Keep replies SHORT (already: 2 bubbles, ~300 chars) | small (output is 5× input price) | — | done |
| Router/filler on Flash-Lite | small | — | done |

**Note on reply length:** LONGER replies cost MORE, not less — output bills at ₹358/M
vs ₹72/M input. Short replies are both cheaper and better for conversion. Do not
lengthen.

## Caching — measure before building

- Code ALREADY reads `cachedContentTokenCount` from Gemini's response
  (`provider.ts:227`; comment: "cached input bills at ~10% of input").
- Explicit caching is NOT wired (no `cachedContent` in the request body).
- Gemini Flash may already do *implicit* caching when the prefix repeats.
- **Step 1 (safe, zero UX impact, ₹0 saved — it's the thermometer):** log
  `cachedContentTokenCount` per call to see how much is already cached.
- **Step 2 (if not already cached):** create an explicit cache of the static
  persona+Vedic block, reference it → those tokens bill at ~10%.
- Tiny cache-storage cost (per-hour TTL) — negligible vs the saving.

Logging changes nothing the user sees: same request to Gemini, same reply, same
timing, same billing — it only writes an existing response number to logs.

## DeepSeek (and other cheaper models) — evaluation notes

DeepSeek V3 is genuinely ~3–4× cheaper than Flash (~₹23/M in, ~₹93/M out). Worth a
proper A/B, but NOT a free switch:
- App is built on Gemini's REST API + `system_instruction` + safety settings +
  **vision (inline images for palm/photo readings)**. DeepSeek text-only → we'd
  still need Gemini for image turns (hybrid).
- **Privacy/DPDP:** birth details + personal problems are sensitive; DeepSeek's own
  API is China-hosted. Prefer DeepSeek open weights via a US/EU host
  (Together/Fireworks/OpenRouter) or self-host if we go this route.
- Quality: strong reasoning/multilingual, but Gemini is very strong on Indian
  languages — needs a real Hindi/Vedic A/B before trusting it with the paid reading.
- Integration: new provider adapter + prompt re-tuning + re-test the whole pipeline.

**Recommendation:** do the cheap, safe wins first (caching + SMS→WhatsApp), keep
Flash for the paid reading, and evaluate DeepSeek behind the existing model-config
abstraction with a quality A/B on real questions before switching anything.

## Order of work (recommended)

1. SMS → WhatsApp OTP (biggest ₹ lever, separate from AI).
2. Cache-token logging (this doc, step 1) → read 1–2 days.
3. Explicit caching if the measurement justifies it.
4. Prompt trim.
5. DeepSeek A/B (only after the above; privacy path decided first).
