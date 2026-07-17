/**
 * Significator Recipe Library — THE MOAT.
 *
 * For each question theme, the exact set of chart factors a master astrologer
 * consults, with ROLES (decisive vs supporting), plus a reasoning SCAFFOLD (the
 * synthesis method the reading model must apply). This is canonical Parashari /
 * Jaimini jyotish encoded as data — not opinion, not guessed. Competitors can
 * copy a UI; they cannot cheaply reproduce this + the eval that proves it.
 *
 * The Selector (next module) reads a recipe, pulls those factors from the
 * COMPLETE chart, and assembles a tight, ordered, grounded briefing. Sub-intent
 * (promise / timing / current_state / remedy) then adds the dasha/gochar focus.
 *
 * Pure data + light helpers — no I/O, unit-testable.
 */

export type Theme =
  | 'marriage'
  | 'love'
  | 'children'
  | 'career'
  | 'wealth'
  | 'health'
  | 'education'
  | 'family'
  | 'spiritual'
  | 'general';

export type SubIntent = 'promise' | 'timing' | 'current_state' | 'remedy' | 'yes_no' | 'general';

export type FactorRole = 'primary' | 'supporting';

export interface HouseFactor {
  house: number; // 1..12
  role: FactorRole;
  why: string; // what this house signifies for THIS theme
}

export interface KarakaFactor {
  planet: string;
  role: FactorRole;
  why: string;
  /** Only relevant for this querent gender (e.g. Jupiter = husband in a female chart). */
  genderOnly?: 'male' | 'female';
}

export interface Recipe {
  theme: Theme;
  houses: HouseFactor[];
  karakas: KarakaFactor[];
  /** Jaimini karakas relevant to the theme (DK spouse, AmK career, PiK children). */
  jaimini: Array<'AK' | 'AmK' | 'BK' | 'MK' | 'PiK' | 'GK' | 'DK' | 'UL'>;
  /** Divisional charts that CONFIRM the theme (D9 marriage, D7 children, D10 career). */
  divisionals: Array<'D9' | 'D7' | 'D10'>;
  /** Yogas/doshas that specifically bear on the theme. */
  yogasDoshas: string[];
  /** The synthesis method the reading model must apply for this theme. */
  scaffold: string;
}

/**
 * Canonical recipes (v1). House numbers are from the Lagna. Roles encode what a
 * real reading weights first. Scaffolds encode the synthesis method — the part
 * that makes the model reason like an astrologer, not pattern-match.
 */
export const RECIPES: Record<Theme, Recipe> = {
  marriage: {
    theme: 'marriage',
    houses: [
      { house: 7, role: 'primary', why: 'marriage, spouse, partnership' },
      { house: 8, role: 'supporting', why: 'mangalya / longevity & depth of the marriage' },
      { house: 2, role: 'supporting', why: 'family life (kutumba) after marriage' },
      { house: 5, role: 'supporting', why: 'romance, love, attraction' },
      { house: 12, role: 'supporting', why: 'bed pleasures; source house of Upapada' },
    ],
    karakas: [
      { planet: 'Venus', role: 'primary', why: 'kalatra karaka — spouse, love, marriage' },
      { planet: 'Jupiter', role: 'supporting', why: 'husband significator', genderOnly: 'female' },
      { planet: 'Mars', role: 'supporting', why: 'passion; Mangal dosha source' },
    ],
    jaimini: ['DK', 'UL'],
    divisionals: ['D9'],
    yogasDoshas: ['Mangal Dosha', 'Kaal Sarp Dosha'],
    scaffold:
      'Judge the marriage PROMISE from the 7th house + its lord’s strength + Venus, ' +
      'then CONFIRM in D9 (D9 Lagna, D9 7th, Venus in D9). Upapada Lagna (and the 2nd ' +
      'from it) shows the marriage & spouse’s family; the Darakaraka describes the ' +
      'spouse. A planet weak in D1 but strong/exalted in D9 improves AFTER marriage / ' +
      'over time. Mangal dosha affects harmony, not the fact of marriage. TIMING = ' +
      'dasha of the 7th lord / Venus / UL lord, and Jupiter’s transit to the 7th or Venus.',
  },
  love: {
    theme: 'love',
    houses: [
      { house: 5, role: 'primary', why: 'romance, affection, love affairs' },
      { house: 7, role: 'primary', why: 'partner, union' },
      { house: 11, role: 'supporting', why: 'fulfilment of desire, friendship' },
      { house: 8, role: 'supporting', why: 'intimacy, hidden bonds' },
    ],
    karakas: [
      { planet: 'Venus', role: 'primary', why: 'love, attraction, romance' },
      { planet: 'Moon', role: 'supporting', why: 'emotions, the heart' },
    ],
    jaimini: ['DK'],
    divisionals: ['D9'],
    yogasDoshas: [],
    scaffold:
      'Read love from the 5th (romance) and 7th (partner) + Venus + Moon (feelings). ' +
      'The 5th–7th link, and Venus’s dignity/aspects, show whether love flows or is ' +
      'blocked. Confirm depth in D9. Whether love converts to marriage rides on the ' +
      '7th house and current dasha activating 5th/7th lords.',
  },
  children: {
    theme: 'children',
    houses: [
      { house: 5, role: 'primary', why: 'progeny, children' },
      { house: 9, role: 'supporting', why: 'grandchildren / dharma of lineage' },
      { house: 2, role: 'supporting', why: 'family expansion' },
      { house: 11, role: 'supporting', why: 'elder child, fulfilment' },
    ],
    karakas: [{ planet: 'Jupiter', role: 'primary', why: 'putra karaka — children' }],
    jaimini: ['PiK'],
    divisionals: ['D7'],
    yogasDoshas: [],
    scaffold:
      'Judge children from the 5th house + its lord + Jupiter (putra karaka), then ' +
      'CONFIRM in D7 (Saptamsa). Affliction of the 5th/Jupiter by Saturn, Rahu or Ketu ' +
      '(or a weak D7) suggests delay or difficulty, NOT denial unless strongly confirmed. ' +
      'TIMING = dasha of the 5th lord / Jupiter, and Jupiter’s transit to the 5th.',
  },
  career: {
    theme: 'career',
    houses: [
      { house: 10, role: 'primary', why: 'karma, profession, status' },
      { house: 6, role: 'supporting', why: 'service, job, competition' },
      { house: 2, role: 'supporting', why: 'income, earnings' },
      { house: 11, role: 'supporting', why: 'gains, fulfilment of ambition' },
      { house: 1, role: 'supporting', why: 'self, drive, effort' },
    ],
    karakas: [
      { planet: 'Saturn', role: 'primary', why: 'karma karaka — work, discipline' },
      { planet: 'Sun', role: 'supporting', why: 'authority, government, status' },
      { planet: 'Mercury', role: 'supporting', why: 'business, commerce, skill' },
    ],
    jaimini: ['AmK'],
    divisionals: ['D10'],
    yogasDoshas: ['Raja Yoga'],
    scaffold:
      'Read career from the 10th house + its lord + karakas (Saturn=work, Sun=authority, ' +
      'Mercury=business), then CONFIRM in D10 (D10 Lagna & 10th). Amatyakaraka shows the ' +
      'profession’s nature. Job vs business: strong 6th/service leans job, strong 3rd/7th ' +
      'leans enterprise. TIMING = dasha of the 10th lord / AmK, and Saturn/Jupiter transits ' +
      'over the 10th.',
  },
  wealth: {
    theme: 'wealth',
    houses: [
      { house: 2, role: 'primary', why: 'accumulated wealth, savings' },
      { house: 11, role: 'primary', why: 'gains, income flow' },
      { house: 5, role: 'supporting', why: 'speculation, poorva punya' },
      { house: 9, role: 'supporting', why: 'fortune, luck' },
    ],
    karakas: [
      { planet: 'Jupiter', role: 'primary', why: 'dhana karaka — wealth, expansion' },
      { planet: 'Venus', role: 'supporting', why: 'luxury, comforts' },
    ],
    jaimini: [],
    divisionals: [],
    yogasDoshas: ['Dhana Yoga', 'Daridra Yoga'],
    scaffold:
      'Judge wealth from the 2nd (savings) and 11th (gains) + their lords + Jupiter. ' +
      'A link between 2nd/11th lords and the 5th/9th (dhana yoga) builds wealth; Daridra ' +
      'yoga or afflicted 2nd/11th strains it. TIMING = dasha of the 2nd/11th lords.',
  },
  health: {
    theme: 'health',
    houses: [
      { house: 1, role: 'primary', why: 'body, vitality, constitution' },
      { house: 6, role: 'primary', why: 'disease, ailments' },
      { house: 8, role: 'supporting', why: 'chronic issues, longevity' },
    ],
    karakas: [
      { planet: 'Sun', role: 'primary', why: 'vitality, general health' },
      { planet: 'Moon', role: 'supporting', why: 'mind, emotional health' },
    ],
    jaimini: [],
    divisionals: [],
    yogasDoshas: ['Sade Sati'],
    scaffold:
      'Read health from the 1st (body) + its lord, the 6th (disease), and the Moon (mind). ' +
      'Malefics on the 1st/6th or a weak lagna lord flag vulnerability; Sade Sati / hard ' +
      'transits time the stress. Frame gently and NEVER give medical diagnosis — suggest ' +
      'care + remedy, and defer to a doctor for anything clinical.',
  },
  education: {
    theme: 'education',
    houses: [
      { house: 4, role: 'primary', why: 'schooling, foundation' },
      { house: 5, role: 'primary', why: 'intelligence, learning' },
      { house: 9, role: 'supporting', why: 'higher education' },
      { house: 3, role: 'supporting', why: 'skills, effort' },
    ],
    karakas: [
      { planet: 'Mercury', role: 'primary', why: 'intellect, study' },
      { planet: 'Jupiter', role: 'primary', why: 'wisdom, knowledge' },
    ],
    jaimini: [],
    divisionals: [],
    yogasDoshas: ['Budhaditya Yoga'],
    scaffold:
      'Read education from the 4th/5th + Mercury (intellect) and Jupiter (wisdom); the ' +
      '9th for higher study. A strong 4th/5th lord and Mercury–Jupiter link support ' +
      'learning. TIMING = dasha of the 4th/5th/9th lords.',
  },
  family: {
    theme: 'family',
    houses: [
      { house: 2, role: 'primary', why: 'immediate family, kutumba' },
      { house: 4, role: 'primary', why: 'mother, home, comfort' },
      { house: 3, role: 'supporting', why: 'siblings' },
      { house: 9, role: 'supporting', why: 'father, elders' },
    ],
    karakas: [
      { planet: 'Moon', role: 'primary', why: 'mother' },
      { planet: 'Sun', role: 'supporting', why: 'father' },
      { planet: 'Mars', role: 'supporting', why: 'siblings' },
    ],
    jaimini: [],
    divisionals: [],
    yogasDoshas: [],
    scaffold:
      'Read family from the 2nd (family unit) and 4th (mother/home); Sun for father, ' +
      'Mars for siblings. Afflictions to these houses/karakas show friction. Keep it warm ' +
      'and relational.',
  },
  spiritual: {
    theme: 'spiritual',
    houses: [
      { house: 9, role: 'primary', why: 'dharma, guru, faith' },
      { house: 12, role: 'primary', why: 'moksha, liberation, retreat' },
      { house: 5, role: 'supporting', why: 'mantra, past-life merit' },
    ],
    karakas: [
      { planet: 'Jupiter', role: 'primary', why: 'guru, wisdom, dharma' },
      { planet: 'Ketu', role: 'supporting', why: 'detachment, moksha' },
    ],
    jaimini: ['AK'],
    divisionals: [],
    yogasDoshas: [],
    scaffold:
      'Read spirituality from the 9th (dharma/guru) and 12th (moksha) + Jupiter and Ketu; ' +
      'the Atmakaraka is the soul’s significator. Ketu’s and the 12th’s condition show the ' +
      'pull toward inner life.',
  },
  general: {
    theme: 'general',
    houses: [{ house: 1, role: 'primary', why: 'self, overall life direction' }],
    karakas: [
      { planet: 'Moon', role: 'primary', why: 'mind, day-to-day life' },
      { planet: 'Sun', role: 'supporting', why: 'soul, vitality' },
    ],
    jaimini: ['AK'],
    divisionals: [],
    yogasDoshas: [],
    scaffold:
      'For an open question, anchor on the Lagna + its lord, the Moon, and the CURRENT ' +
      'Mahadasha/Antardasha (what life-theme is running now), plus the strongest yoga and ' +
      'any active dosha or Sade Sati. Lead with what is most alive right now.',
  },
};

/** What each sub-intent ADDS on top of a theme's natal factors. */
export const SUBINTENT_FOCUS: Record<SubIntent, string> = {
  promise: 'Weigh the natal promise + divisional confirmation (D9/D7/D10 strength).',
  timing:
    'Add the dasha of the theme’s house-lord/karaka and the relevant gochar transits; ' +
    'give a window, never a false-precise date.',
  current_state:
    'Add the CURRENT Mahadasha/Antardasha and live gochar hitting the theme factors — ' +
    'explain why things feel as they do NOW.',
  remedy:
    'Identify the weakest/most-afflicted theme factor and speak to strengthening it ' +
    '(gemstone/mantra/pooja/charity) — grounded, never a guaranteed cure.',
  yes_no:
    'Give a clear leaning with the key reason, but keep the honest nuance — astrology ' +
    'shows tendencies, not certainties.',
  general: 'Read the theme’s core factors and lead with what is strongest.',
};

/** Convenience: the primary houses for a theme (used by the selector + tests). */
export function primaryHouses(theme: Theme): number[] {
  return RECIPES[theme].houses.filter((h) => h.role === 'primary').map((h) => h.house);
}
