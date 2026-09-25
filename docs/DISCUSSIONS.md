# Discussions — running log of open decisions

A shared scratchpad for big decisions in progress: what we tested, what we found,
what's still open, and where we landed. Newest topic on top. This is for
back-and-forth thinking; once a decision is FINAL it also gets recorded in
`PROJECT_STATUS.md`.

---

## DeepSeek as primary AI (cost + multilingual moat) — IN PROGRESS

**Status:** Evaluation strongly positive. **Decision PENDING** — to be finalised
after (1) rate-limit check, (2) fallback-route design, (3) a joint review.
Started 2026-09-25.

### Why we're doing this
- **Cut cost.** Gemini Flash is the current live reading model. Cloud bill was
  ~₹7k/month for ~600–700 users; AI is a big lever.
- **Multilingual moat.** A human astrologer can't natively serve Nagamese +
  Tamil + Bengali + Urdu at once. An AI that answers each user in their own
  regional script removes that supply limit — and lets us run region-targeted ads
  (e.g. Nagamese for Nagaland) that no competitor can match.

### How we tested (unbiased)
- Harness: `firebase/functions/scripts/model_audit.mjs`. **Standalone — it does
  NOT touch the live app, functions, Firestore, or users.** Runs only on the
  founder's Mac.
- Both models get the **identical real production prompt** (`buildReadingSystem`)
  and both outputs run through the **real production guard** (`guardReply` +
  envelope parse + grounding). No hand-tuned advantage for either.
- DeepSeek gets a thin reinforcement cap on top (facts / gender / script / output
  shape) + a deterministic script-lock — the real DeepSeek-tuned production setup.
  Full tuning write-up: `docs/DEEPSEEK_TUNING.md`.
- 40 scenarios: address tiers, gender concord, school methods, whose-kundli
  routing, abuse vs genuine intimacy, death-scare, off-topic, AI-probe, sceptic,
  fact-discipline traps, jailbreak, 8+ regional scripts, and 7 regional-ad markets.
- Model: `deepseek/deepseek-v4-flash-0731` via OpenRouter. Gemini: `gemini-flash-latest`.

### Final result (run of 2026-09-25, commit cb21d15)
- **Quality: DeepSeek 35/40, Flash 30/40.** DeepSeek won.
- **Cost: DeepSeek ₹0.0183/reply vs Flash ₹0.4070/reply → 22.3× cheaper, 95.5%
  saving.** DeepSeek even used fewer output tokens (4,913 vs 7,692).
- Monthly projection (per-reply × volume):
  | replies/mo | Flash | DeepSeek | saving |
  |---|---|---|---|
  | 10,000 | ₹4,070 | ₹183 | ₹3,887 |
  | 30,000 | ₹12,210 | ₹548 | ₹11,662 |
  | 60,000 | ₹24,420 | ₹1,096 | ₹23,324 |
  | 100,000 | ₹40,700 | ₹1,827 | ₹38,873 |
  - Caveat: test sends the full ~4k-token prompt uncached every turn. Production
    caching lowers input cost for both; the durable gap is DeepSeek's output rate
    (~₹28 vs Gemini's ₹358 per 1M). Realistic real-world saving: **85–95%.**

### The multilingual moat — PROVEN
- **Regional native scripts: DeepSeek 7/7, Flash 3/7.** DeepSeek replied in real
  Tamil, Telugu, Bengali, Kannada, Malayalam, Gujarati, Punjabi, **Odia, Urdu,
  Assamese**. Flash returned Odia/Urdu/Assamese/Tamil/Telugu/Gujarati in romanised
  English letters — unusable for those users.
- **Nagamese (Nagaland):** DeepSeek answered in actual Nagamese
  ("Beta, chinta nokoriba, aami aapunar kundli sai aasilong…"). Flash replied in
  Hindi. → Region-targeted regional-language ads are viable with DeepSeek.

### Everyday answer quality
- On the normal, high-traffic questions (career, marriage, health, business,
  love, numerology, milan, emotional distress, refunds, off-topic, sceptic),
  **DeepSeek passed every one** — warm, in-character, positive, with hold-back +
  hook. Often more empathetic than Flash. This is what real paying users see.

### Bugs found & fixed during the eval
1. **Empty responses (~22% early on).** Cause: some OpenRouter providers ignore
   JSON mode → empty content. Fix: `provider.require_parameters` + retry (json
   mode kept ON) + read `content` only.
2. **Chain-of-thought "reasoning" mode.** Some providers ran V4-Flash in reasoning
   mode → 2,000 CoT tokens/reply (11× cost) + truncation/leaks. Fix:
   `reasoning:{ enabled:false }`. This is what took the saving from ~86% → ~95%.
3. **Hindi-Devanagari romanising to Hinglish.** Fix: deterministic script-lock
   (detect input script in code, force reply script). Made all regional scripts
   reliable; Hindi still occasionally slips to Hinglish (acceptable for Hindi).
4. **Fact-discipline under pressure.** Once confirmed a fake placement when pushed;
   RULE 1 hardened + the grounding guard catches it regardless (regenerates).

### DeepSeek's known quirks (and how we handle them)
- Slight run-to-run variance (temp 0.6) — the guard + fallback absorb it.
- Hindi-Devanagari → sometimes Hinglish (commercially fine).
- Guard is blunt: it flags a planet name even when the astrologer names it to
  DECLINE/CORRECT a user's false claim → both models "fail" those. **Production
  fix needed:** don't force-repair when the reply is a refusal/correction.

### Reliability design (the founder's two worries)
- **Empty / bad response:** checked before the user sees it; retry once, then fall
  back to Gemini. Customer never sees a dead reply.
- **Fallback chain:** DeepSeek → Gemini Flash → Gemini Flash-Lite. If OpenRouter
  is down, Gemini catches it directly (not via OpenRouter). A reply can't die.
- **Kill switch:** DeepSeek on/off is one config value — no redeploy, back to 100%
  Gemini in seconds.
- **Monitoring:** every reply logs which model answered + DeepSeek's empty-rate.

### OPEN ITEMS — for tomorrow's joint review
- [ ] **Rate limits:** confirm OpenRouter/DeepSeek limits at our volume; make sure
      we won't "hit a wall like Gemini Pro did." Limits scale with credit balance.
- [ ] **How to judge safely with the LIVE ad campaign running:** prefer SHADOW
      MODE — DeepSeek generates its reply in the background on real user questions,
      we log it beside the Gemini reply the user actually got, user sees only
      Gemini. Zero risk to the campaign; lets us compare both on real traffic, not
      synthetic tests, before any switch. Also re-examine today's cost numbers
      carefully against real prompt sizes + caching.
- [ ] **Fallback routes:** design exactly — DeepSeek → Flash → Flash-Lite; decide
      triggers (empty / degenerate / error / guard=fallback), timeouts, and
      whether OpenRouter's own multi-provider routing is enough or we pin providers.
- [ ] **Production guard fix:** stop force-repairing when the model names a factor
      only to decline/correct; add the invented-HOUSE check the guard currently
      misses.
- [ ] **Prompt caching** in production to lower input cost for both models.
- [ ] **Verify a few more languages** if wanted (Manipuri/Meitei, Maithili, etc.).
- [ ] **Then: final go/no-go decision** on DeepSeek-primary.

### Current lean
DeepSeek-primary with the Gemini fallback chain + kill switch. Cost win is large
and stable; quality is equal-or-better; the regional-language moat is unique to
DeepSeek. Not going live until rate limits + fallback routes are locked and we
decide together.
