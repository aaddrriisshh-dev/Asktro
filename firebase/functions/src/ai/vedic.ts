/**
 * Vedic astrology math — pure, deterministic computations shared by the chart
 * assembler. NO interpretation, NO LLM: just the classical rules (sign lords,
 * planetary dignity, graha drishti/aspects, karakas). Feeding the model these
 * PRE-COMPUTED structural conclusions ("Venus: debilitated", "7th aspected by
 * Saturn") is what keeps readings sharp and keeps the model from doing — and
 * botching — astrology math itself.
 *
 * All sign ids are 0-indexed (Aries=0 … Pisces=11), matching ProKerala's rasi id.
 */

/** The seven classical planets we compute dignity/aspects for (nodes handled apart). */
export const GRAHAS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'] as const;
export type Graha = (typeof GRAHAS)[number];

/** Ruling planet of each sign (0-indexed). */
export const SIGN_LORD: Graha[] = [
  'Mars', // Aries
  'Venus', // Taurus
  'Mercury', // Gemini
  'Moon', // Cancer
  'Sun', // Leo
  'Mercury', // Virgo
  'Venus', // Libra
  'Mars', // Scorpio
  'Jupiter', // Sagittarius
  'Saturn', // Capricorn
  'Saturn', // Aquarius
  'Jupiter', // Pisces
];

export function signLord(signId: number): Graha {
  return SIGN_LORD[((signId % 12) + 12) % 12];
}

const EXALTATION: Record<Graha, number> = {
  Sun: 0, // Aries
  Moon: 1, // Taurus
  Mars: 9, // Capricorn
  Mercury: 5, // Virgo
  Jupiter: 3, // Cancer
  Venus: 11, // Pisces
  Saturn: 6, // Libra
};
// Debilitation is the 7th sign from exaltation.
const DEBILITATION: Record<Graha, number> = Object.fromEntries(
  GRAHAS.map((g) => [g, (EXALTATION[g] + 6) % 12]),
) as Record<Graha, number>;

const OWN_SIGNS: Record<Graha, number[]> = {
  Sun: [4],
  Moon: [3],
  Mars: [0, 7],
  Mercury: [2, 5],
  Jupiter: [8, 11],
  Venus: [1, 6],
  Saturn: [9, 10],
};

// Moolatrikona sign + degree band (within that sign) — a notch below own/exalted.
const MOOLATRIKONA: Record<Graha, { sign: number; from: number; to: number }> = {
  Sun: { sign: 4, from: 0, to: 20 },
  Moon: { sign: 1, from: 3, to: 30 },
  Mars: { sign: 0, from: 0, to: 12 },
  Mercury: { sign: 5, from: 15, to: 20 },
  Jupiter: { sign: 8, from: 0, to: 10 },
  Venus: { sign: 6, from: 0, to: 15 },
  Saturn: { sign: 10, from: 0, to: 20 },
};

// Natural (naisargika) friendships; anyone not listed friend/enemy is neutral.
const NATURAL: Record<Graha, { friends: Graha[]; enemies: Graha[] }> = {
  Sun: { friends: ['Moon', 'Mars', 'Jupiter'], enemies: ['Venus', 'Saturn'] },
  Moon: { friends: ['Sun', 'Mercury'], enemies: [] },
  Mars: { friends: ['Sun', 'Moon', 'Jupiter'], enemies: ['Mercury'] },
  Mercury: { friends: ['Sun', 'Venus'], enemies: ['Moon'] },
  Jupiter: { friends: ['Sun', 'Moon', 'Mars'], enemies: ['Mercury', 'Venus'] },
  Venus: { friends: ['Mercury', 'Saturn'], enemies: ['Sun', 'Moon'] },
  Saturn: { friends: ['Mercury', 'Venus'], enemies: ['Sun', 'Moon', 'Mars'] },
};

export type Dignity =
  | 'exalted'
  | 'debilitated'
  | 'moolatrikona'
  | 'own sign'
  | 'friendly sign'
  | 'enemy sign'
  | 'neutral sign';

/**
 * Classical dignity of a planet in a sign (with degree for moolatrikona). Nodes
 * (Rahu/Ketu) have no consensus dignity → returns null; caller omits it.
 */
export function dignity(planet: string, signId: number, degree: number): Dignity | null {
  if (!isGraha(planet)) return null;
  if (EXALTATION[planet] === signId) return 'exalted';
  if (DEBILITATION[planet] === signId) return 'debilitated';
  const mt = MOOLATRIKONA[planet];
  if (mt.sign === signId && degree >= mt.from && degree < mt.to) return 'moolatrikona';
  if (OWN_SIGNS[planet].includes(signId)) return 'own sign';
  const lord = signLord(signId);
  if (lord === planet) return 'own sign';
  if (NATURAL[planet].friends.includes(lord)) return 'friendly sign';
  if (NATURAL[planet].enemies.includes(lord)) return 'enemy sign';
  return 'neutral sign';
}

/** Whether a dignity is a strength (for a quick strong/weak flag). */
export function isStrong(d: Dignity | null): boolean {
  return d === 'exalted' || d === 'moolatrikona' || d === 'own sign' || d === 'friendly sign';
}

// Graha drishti: every planet aspects the 7th; Mars +4/+8, Jupiter +5/+9,
// Saturn +3/+10. Values are house-count aspects (1 = the planet's own house).
const ASPECT_HOUSES: Record<Graha, number[]> = {
  Sun: [7],
  Moon: [7],
  Mercury: [7],
  Venus: [7],
  Mars: [4, 7, 8],
  Jupiter: [5, 7, 9],
  Saturn: [3, 7, 10],
};

/**
 * Houses (1..12) a planet placed in `house` aspects by graha drishti. Nodes are
 * given the 7th only (their fuller aspects are disputed — kept conservative).
 */
export function aspectedHouses(planet: string, house: number): number[] {
  const rels = isGraha(planet) ? ASPECT_HOUSES[planet] : [7];
  return rels.map((n) => ((house - 1 + (n - 1)) % 12) + 1);
}

/** Natural significations (karaka) — which life areas a planet speaks for. */
export const KARAKA: Record<string, string> = {
  Sun: 'soul, father, authority, career/status',
  Moon: 'mind, mother, emotions',
  Mars: 'energy, siblings, courage, property',
  Mercury: 'intellect, speech, business',
  Jupiter: 'wisdom, children, husband (female chart), wealth',
  Venus: 'spouse, marriage, love, comforts',
  Saturn: 'career, discipline, longevity, delays',
  Rahu: 'ambition, foreign, obsession',
  Ketu: 'detachment, spirituality, loss',
};

/** The primary significator planet for each common question theme. */
export const THEME_KARAKA = {
  marriage: 'Venus',
  love: 'Venus',
  children: 'Jupiter',
  career: 'Saturn',
  wealth: 'Jupiter',
  health: 'Sun',
} as const;

function isGraha(p: string): p is Graha {
  return (GRAHAS as readonly string[]).includes(p);
}
