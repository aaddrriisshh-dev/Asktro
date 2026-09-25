# DeepSeek tuning — how to get the best out of DeepSeek (via OpenRouter)

This is the playbook for running DeepSeek as Asktro's primary reading model. It
captures what actually works after a full multi-angle audit against Gemini Flash
(`scripts/model_audit.mjs`). Keep it updated as we learn more.

**Why DeepSeek:** ~95% cheaper than Gemini Flash for our reply volume, with
equal-or-better quality once tuned. In the audit it edged Flash (20/23 vs 19/23)
and was clearly BETTER at Indian regional scripts (Tamil / Telugu / Kannada),
where Flash fell back to romanised text.

Target model slug: `deepseek/deepseek-v4-flash-0731` (GA/stable).

---

## 1. The API call (this is where most failures hid)

DeepSeek on OpenRouter is routed across many hosting providers, and that is the
single biggest source of trouble. The reading quality was never the problem — the
problem was the *call*. Non-negotiables:

- **`provider: { require_parameters: true }`** — forces OpenRouter to only route
  to providers that actually honour `response_format` + `temperature`. WITHOUT
  this, some providers silently ignore JSON mode and return **empty content**
  (`""`). This was the cause of the "22% failure" scare — they weren't bad
  answers, they were blank responses.
- **Fall back to `message.reasoning` ONLY if it contains the JSON envelope**
  (`"messages"`). Never surface it blindly — when a provider truncates, it leaks
  raw chain-of-thought into that field, which must never reach the user.
- **Retry once, KEEPING `response_format: json_object` ON**, if the first call
  comes back empty OR degenerate (valid JSON but no usable message, e.g.
  `{"":[""]}`). A fresh call usually lands on a different provider. **Do NOT retry
  with json-mode OFF** — plain retries let some providers (e.g. Cohere) dump
  chain-of-thought and hit the token limit (`finish=length via=reasoning`),
  producing garbage. json-mode is what keeps the reply clean.
- **`max_tokens: 2000`** (not 1500 — one reply was truncated mid-JSON at 1500).
- **`temperature: 0.6`** (lower than Flash's 0.9 — DeepSeek is steadier at 0.6).
- Send `HTTP-Referer` + `X-Title` headers (OpenRouter attribution; harmless, good
  hygiene).
- **Always log `provider` + `finish_reason` + `completion_tokens` per call** so
  any future empty/degenerate response is diagnosable at a glance, not a guess.

See `askDeepSeek()` in `scripts/model_audit.mjs` for the reference implementation.

---

## 2. The reinforcement prompt (goes ABOVE the real persona prompt)

DeepSeek gets the **identical** production prompt Gemini gets
(`buildReadingSystem`), plus a short "FOUR ABSOLUTE RULES" cap at the very top.
Nothing is removed from the persona — the cap just front-loads the few rules
DeepSeek is most likely to break, in DeepSeek's preferred explicit style. See
`deepseekPrompt()` in the harness for the live text. The four rules:

1. **FACTS ONLY** — never name a planet/house/sign/nakshatra/dasha/number that
   isn't literally in the facts block. If a factor is missing, say so in-character
   and set `confidence:"insufficient"`. (Covers the invented-house gap the
   production guard currently misses.)
2. **GENDER** — every Hindi first-person self-verb must match the astrologer's
   gender (male "raha hoon" / female "rahi hoon"), with explicit examples.
3. **MIRROR LANGUAGE + SCRIPT** — reply in the same script the client wrote in.
   **This must explicitly OVERRIDE the "default to Hinglish" instruction**, or
   DeepSeek romanises Hindi-in-Devanagari (its one script weak spot — it handles
   Tamil/Telugu/Bengali/Kannada/Marathi correctly, but converts Devanagari Hindi
   to Hinglish unless told not to). Call out Devanagari by name and give an
   example.
4. **OUTPUT SHAPE** — one JSON object, top-level key exactly `"messages"`, an
   array of 1–2 non-empty strings. Explicitly ban `{"":[""]}`, `{"messages":[]}`,
   empty object (the rare degenerate output on dismissive/provocative inputs).

---

## 3. Known DeepSeek quirks (and the fix)

| Quirk | Cause | Fix |
|---|---|---|
| Empty response `""` | provider ignores json-mode | `require_parameters` + retry-plain |
| Truncated mid-JSON | `max_tokens` too low | raise to 2000 |
| Degenerate `{"":[""]}` | model gives up on a dismissive input | RULE 4 + retry-on-degenerate |
| Hindi in Devanagari → romanised | "default Hinglish" wins over mirror | RULE 3 explicit Devanagari override |
| Answer in `reasoning`, content empty | some providers | read `reasoning` as fallback |

Regional scripts (Tamil/Telugu/Kannada/Bengali/Marathi/Malayalam/Gujarati/
Gurmukhi): DeepSeek is strong out of the box — no special handling beyond RULE 3.

---

## 4. Going live (planned)

- Primary: DeepSeek V4 Flash 0731 (OpenRouter) with the config + cap above.
- Fallback chain so a reply NEVER fails: DeepSeek → Gemini Flash → Gemini
  Flash-Lite. Trigger fallback on: empty/degenerate content, API error, or the
  production guard returning FALLBACK.
- Wire the reinforcement cap + API config into the real reading path
  (`provider.ts` / reading model call), not just the harness.
- Rate limits: OpenRouter limits scale with credit balance; keep a working
  balance and monitor. The fallback chain is the real safety net if OpenRouter or
  a specific provider hiccups.

## 5. Also worth fixing in production (surfaced by the audit)

- The grounding guard (`envelope.ts validateGrounding`) catches invented
  planets/signs/nakshatras/yogas/doshas but **NOT invented houses** (e.g. "10th
  house" when the chart never listed it). Add a house check to the guard — the
  audit already does this heuristically (`housesIn`).
