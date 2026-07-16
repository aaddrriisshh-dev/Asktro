/**
 * Vedic-astrology lexicon — the finite vocabulary of chart FACTORS the AI may
 * name. Used by the grounding validator: any factor the reply names must appear
 * in the chart-facts block, and to name it at all it must be a known factor
 * here (so free prose about "career", "love", "patience" is never flagged —
 * only concrete placements are grounded).
 *
 * Names include the common English + Sanskrit/Hindi spellings the model tends to
 * use, so matching is robust to Hinglish. Lowercased at match time.
 */

/** The nine grahas (planets/luminaries + nodes). */
export const PLANETS: Record<string, string> = {
  sun: 'Sun', surya: 'Sun',
  moon: 'Moon', chandra: 'Moon',
  mars: 'Mars', mangal: 'Mars', mangala: 'Mars', kuja: 'Mars',
  mercury: 'Mercury', budh: 'Mercury', budha: 'Mercury',
  jupiter: 'Jupiter', guru: 'Jupiter', brihaspati: 'Jupiter', brhaspati: 'Jupiter',
  venus: 'Venus', shukra: 'Venus', shukr: 'Venus',
  saturn: 'Saturn', shani: 'Saturn', sani: 'Saturn',
  rahu: 'Rahu',
  ketu: 'Ketu',
};

/** The twelve rashis (signs) — English + Sanskrit. */
export const SIGNS: Record<string, string> = {
  aries: 'Aries', mesh: 'Aries', mesha: 'Aries',
  taurus: 'Taurus', vrishabh: 'Taurus', vrishabha: 'Taurus', vrsabha: 'Taurus',
  gemini: 'Gemini', mithun: 'Gemini', mithuna: 'Gemini',
  cancer: 'Cancer', kark: 'Cancer', karka: 'Cancer', karkat: 'Cancer',
  leo: 'Leo', simha: 'Leo', sinh: 'Leo',
  virgo: 'Virgo', kanya: 'Virgo',
  libra: 'Libra', tula: 'Libra', tul: 'Libra',
  scorpio: 'Scorpio', vrishchik: 'Scorpio', vrischika: 'Scorpio', vrshchika: 'Scorpio',
  sagittarius: 'Sagittarius', dhanu: 'Sagittarius', dhanus: 'Sagittarius',
  capricorn: 'Capricorn', makar: 'Capricorn', makara: 'Capricorn',
  aquarius: 'Aquarius', kumbh: 'Aquarius', kumbha: 'Aquarius',
  pisces: 'Pisces', meen: 'Pisces', meena: 'Pisces',
};

/** The 27 nakshatras (lunar mansions). */
export const NAKSHATRAS: string[] = [
  'ashwini', 'bharani', 'krittika', 'kritika', 'rohini', 'mrigashira', 'mrigashirsha',
  'ardra', 'aardra', 'punarvasu', 'pushya', 'ashlesha', 'aslesha', 'magha',
  'purva phalguni', 'purvaphalguni', 'uttara phalguni', 'uttaraphalguni', 'hasta',
  'chitra', 'swati', 'swathi', 'vishakha', 'visakha', 'anuradha', 'jyeshtha', 'jyeshta',
  'mula', 'moola', 'purva ashadha', 'purvashadha', 'uttara ashadha', 'uttarashadha',
  'shravana', 'sravana', 'dhanishta', 'dhanishtha', 'shatabhisha', 'shatabhishak',
  'purva bhadrapada', 'uttara bhadrapada', 'revati',
];

/** Common yogas the model may reference. */
export const YOGAS: string[] = [
  'gajakesari', 'gaja kesari', 'budhaditya', 'budh aditya', 'raja yoga', 'rajyoga',
  'dhana yoga', 'dhan yoga', 'panch mahapurush', 'panchamahapurusha', 'ruchaka',
  'bhadra', 'hamsa', 'malavya', 'sasha', 'neecha bhanga', 'neechabhanga',
  'kemadruma', 'chandra mangal', 'vipreet raja', 'viparita raja', 'kaal sarp',
  'kalsarp', 'kaal sarpa', 'kalasarpa',
];

/** Common doshas. */
export const DOSHAS: string[] = [
  'mangal dosha', 'manglik', 'mangalik', 'kuja dosha', 'kaal sarp dosha',
  'kalsarp dosha', 'pitra dosha', 'pitru dosha', 'nadi dosha', 'bhakoot dosha',
  'gana dosha', 'shani dosha', 'sade sati', 'sadesati', 'shani sade sati',
];

/** Dasha-system planet-period words (mahadasha / antardasha lords are planets). */
export const DASHA_WORDS: string[] = ['mahadasha', 'antardasha', 'dasha', 'dasa', 'bhukti', 'pratyantar'];

/**
 * All single-token factor keys we recognise (planets + signs), for fast
 * membership tests. Multi-word factors (nakshatras/yogas/doshas) are matched by
 * substring since they can appear inline in Hinglish prose.
 */
export function factorLexicon(): {
  singleTokens: Set<string>;
  phrases: string[];
} {
  const singleTokens = new Set<string>([
    ...Object.keys(PLANETS),
    ...Object.keys(SIGNS),
    ...NAKSHATRAS.filter((n) => !n.includes(' ')),
  ]);
  const phrases = [
    ...NAKSHATRAS.filter((n) => n.includes(' ')),
    ...YOGAS,
    ...DOSHAS,
  ];
  return { singleTokens, phrases };
}
