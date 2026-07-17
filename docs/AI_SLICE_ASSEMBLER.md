# Asktro AI — Slice Assembler (the reasoning-briefing engine)

_The piece that turns the COMPLETE computed chart into a tight, question-specific,
reasoning-ready briefing for the reading model. This is where 99% accuracy is won
or lost. Companion to `AI_ASTROLOGER_BUILD.md` (chart engine) and
`AI_ASTROLOGER_ENGINE.md` (vision)._

## Why it exists
The chart brain now computes MORE than a human astrologer uses in a chat (D1,
houses, lords, dignity, aspects, karakas, D9/D7/D10, Chara Karakas, Upapada,
gochar, Sade Sati, dashas, yogas, doshas). Feeding all of it every message is
slow, costly, and — worst — **less accurate**, because irrelevant facts dilute the
model's focus. A master astrologer pulls only the threads that matter for the
exact question. The slice assembler does the same, deterministically.

## The 6 layers
1. **Intent router** (LLM router-tier + deterministic fallback): message →
   `{ themes[], subIntent, person }`.
   - Themes: marriage, love, children, career, wealth, health, education, family,
     spiritual, general.
   - Sub-intents: `promise` (will it / how good), `timing` (when), `current_state`
     (what's happening / why bad now), `remedy` (what to do), `yes_no`, `general`.
2. **Significator Recipe Library** (THE MOAT — expert-authored canonical jyotish):
   per theme, the factor set with ROLES.
   - `houses`: {house, role: primary|supporting, why}
   - `karakas`: significator planets (+ gender-conditional, e.g. Jupiter=husband
     in a female chart)
   - `jaimini`: DK / UL / AmK / PiK as relevant
   - `divisionals`: D9 (marriage), D7 (children), D10 (career)
   - `yogasDoshas`: the ones that matter (e.g. Mangal Dosha for marriage)
3. **Selector** (deterministic): pull the recipe's factors from the complete chart,
   resolve to grounded facts, order primary→supporting, ALWAYS include anchors
   (Lagna, Moon, current Mahadasha), enforce a token budget (drop lowest-weight
   supporting first — never a primary).
4. **Reasoning Scaffold** (per-theme synthesis rules): the method the model must
   apply — "judge the promise from house+lord+karaka, CONFIRM in the divisional; a
   factor fires when its dasha runs; weak-D1/strong-D9 strengthens over time." Turns
   the LLM from pattern-matcher into method-applier.
5. **Grounding contract** (built): the slice defines the allowed universe; the
   grounding validator rejects anything outside it.
6. **Eval harness**: labeled questions → expert-required factor set + rubric-graded
   ideal answer. Measure recall (all needed factors present?), precision (noise
   excluded?), reading-match. This is how 99% is MEASURED, not claimed.

## Sub-intent modifiers (same theme, different slice)
- `promise`   → natal house+lord+karaka + divisional strength (D9/D7/D10)
- `timing`    → + dasha of the theme lord/karaka + relevant gochar transits
- `current_state` → + current dasha & gochar hitting the theme factors
- `remedy`    → + the afflicting factor (weak/afflicted lord or karaka)

## Canonical recipes (v1 — Parashari/Jaimini; refine with expert review)
- **marriage**: 7th(P: spouse/union), 2nd(S: family/kutumba), 8th(S: mangalya/
  longevity), 5th(S: romance), 12th(S: bed/UL source); karakas Venus(P),
  Jupiter(husband, female chart); Jaimini DK, UL; divisional D9; Mangal Dosha.
- **children**: 5th(P: progeny), 9th(S), 2nd(S: family), 11th(S: elder child);
  karaka Jupiter(P, putra); Jaimini PiK; divisional D7.
- **career**: 10th(P: karma), 6th(S: service/job), 2nd(S: income), 11th(S: gains),
  1st(S: effort); karakas Saturn(work), Sun(authority), Mercury(business); Jaimini
  AmK; divisional D10.
- **wealth**: 2nd(P: wealth), 11th(P: gains), 5th(S), 9th(S: fortune); karaka
  Jupiter; dhana yogas.
- **health**: 1st(P: body), 6th(P: disease), 8th(S: chronic/longevity); karaka Sun,
  lagna lord; Moon(mind).
- **general**: Lagna+lord, Moon, current Mahadasha/Antardasha, strongest yoga,
  any active dosha, Sade Sati.

## Non-negotiables
- **Anchors always present** (Lagna, Moon, current dasha) — orientation.
- **Never drop a primary** under budget pressure.
- **Absence is information** — "no Mangal dosha" is a fact worth including.
- **Pre-digested conclusions** (strong/weak, aspected-by) over raw numbers.
- Every recipe + scaffold is **version-controlled and eval-gated** — the moat.
