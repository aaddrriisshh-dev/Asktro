/**
 * Numerology grounding — the authentic method for a `tradition: 'numerology'`
 * persona, so a numerologist reads from REAL computed numbers instead of the
 * Vedic chart (which she never uses). Indian numerology in practice is built on:
 *   - Moolank  (mulank / psychic / root number): the day of birth reduced to 1–9
 *              — the person's core nature.
 *   - Bhagyank (destiny / life-path number): the WHOLE date of birth reduced
 *              — the life direction / what they came to do.
 *   - Naamank  (name number): the name reduced via the CHALDEAN values used by
 *              Indian numerologists (Cheiro school) — how the name supports them.
 * Each number carries a ruling planet (1=Sun … 9=Mars), the standard association.
 *
 * Pure + deterministic (no I/O) → unit-tests in isolation. All figures are real
 * arithmetic, so the reading is grounded, not invented.
 */

const IST_MS = 5.5 * 3600 * 1000;

/** Ruling planet per number (classical numerology association). */
const NUMBER_PLANET: Record<number, string> = {
  1: 'Sun (Surya)', 2: 'Moon (Chandra)', 3: 'Jupiter (Guru/Brihaspati)', 4: 'Rahu',
  5: 'Mercury (Budh)', 6: 'Venus (Shukra)', 7: 'Ketu', 8: 'Saturn (Shani)', 9: 'Mars (Mangal)',
};

/** One-line core nature per number (kept short; the model elaborates in voice). */
const NUMBER_TRAIT: Record<number, string> = {
  1: 'a natural leader — independent, ambitious, original, wants to be first.',
  2: 'sensitive, intuitive, diplomatic, emotional; works best in partnership.',
  3: 'expressive, optimistic, creative, social; drawn to knowledge and teaching.',
  4: 'practical, hard-working, systematic; a builder who meets sudden change.',
  5: 'restless, quick, communicative, freedom-loving; a versatile mind.',
  6: 'loving, responsible, home- and beauty-oriented; a natural carer.',
  7: 'thoughtful, spiritual, analytical, a seeker; needs solitude and meaning.',
  8: 'disciplined, determined, karmic; slow-built success through effort.',
  9: 'courageous, energetic, idealistic, generous; a fighter for causes.',
};

/** Chaldean letter values used by Indian (Cheiro-school) numerologists. Note 9 is
 *  never assigned to a letter in the Chaldean system. */
const CHALDEAN: Record<string, number> = {
  A: 1, I: 1, J: 1, Q: 1, Y: 1,
  B: 2, K: 2, R: 2,
  C: 3, G: 3, L: 3, S: 3,
  D: 4, M: 4, T: 4,
  E: 5, H: 5, N: 5, X: 5,
  U: 6, V: 6, W: 6,
  O: 7, Z: 7,
  F: 8, P: 8,
};

/** Reduce a positive integer to a single digit 1–9 (0 maps to 9, as in a mod-9
 *  digital root). Master numbers are not preserved — Indian practice reads 1–9. */
export function reduceToDigit(n: number): number {
  let x = Math.abs(Math.trunc(n));
  while (x > 9) {
    x = String(x).split('').reduce((s, d) => s + Number(d), 0);
  }
  return x === 0 ? 9 : x;
}

/** Moolank (psychic number) from the day of the month (1–31). */
export function moolank(day: number): number {
  return reduceToDigit(day);
}

/** Bhagyank (destiny number) from the full date of birth. */
export function bhagyank(day: number, month: number, year: number): number {
  const sum = String(day).split('').concat(String(month).split(''), String(year).split(''))
    .reduce((s, d) => s + Number(d), 0);
  return reduceToDigit(sum);
}

/** Naamank (name number) via Chaldean values; non-letters ignored. 0 if no letters. */
export function naamank(name: string): number {
  const sum = name.toUpperCase().split('').reduce((s, ch) => s + (CHALDEAN[ch] ?? 0), 0);
  return sum > 0 ? reduceToDigit(sum) : 0;
}

export interface NumerologyFacts {
  day: number; month: number; year: number;
  moolank: number; bhagyank: number; naamank: number;
}

/** Compute the core numbers from a birth epoch-ms + name. Returns null if no
 *  valid birth date is available (the engine then bows out gracefully). */
export function computeNumerology(birthMs: number | null | undefined, name?: string): NumerologyFacts | null {
  if (birthMs == null || !Number.isFinite(birthMs)) return null;
  const d = new Date(birthMs + IST_MS); // read IST calendar parts
  const day = d.getUTCDate();
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();
  const nm = naamank(name ?? '');
  return { day, month, year, moolank: moolank(day), bhagyank: bhagyank(day, month, year), naamank: nm };
}

/** The facts block a numerology persona reads THIS turn — mirrors the chart
 *  briefing's role for a Vedic persona, but built from real numbers. */
export function buildNumerologyBriefing(birthMs: number | null | undefined, name?: string): string | null {
  const f = computeNumerology(birthMs, name);
  if (!f) return null;
  const line = (label: string, n: number) =>
    `- ${label}: ${n} — ruled by ${NUMBER_PLANET[n]}. ${NUMBER_TRAIT[n]}`;
  const parts = [
    `NUMBERS for this person (born ${two(f.day)}-${two(f.month)}-${f.year}):`,
    line('Moolank (psychic / core nature)', f.moolank),
    line('Bhagyank (destiny / life path)', f.bhagyank),
  ];
  if (f.naamank > 0) parts.push(line('Naamank (name number)', f.naamank));
  parts.push(
    'METHOD: read from THESE numbers only. Moolank = their inborn nature; Bhagyank = ' +
    'their life direction and the lessons of this life; Naamank = how their name ' +
    'supports or strains the two. Where Moolank and Bhagyank are friendly numbers it ' +
    'flows; where they clash, name it gently. You may suggest a favourable number, ' +
    'day, or colour. Speak in numbers and their ruling planets — never read a birth ' +
    'chart, houses, or dashas.',
  );
  return parts.join('\n');
}

function two(n: number): string { return String(n).padStart(2, '0'); }
