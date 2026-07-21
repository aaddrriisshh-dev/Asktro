/**
 * Unit tests for the numerology grounding math — the numbers a numerologist
 * persona reads from. All deterministic arithmetic.
 */
import {
  reduceToDigit, moolank, bhagyank, naamank, computeNumerology, buildNumerologyBriefing,
} from './numerology';

describe('reduceToDigit (digital root, 1–9)', () => {
  it('reduces multi-digit to a single 1–9', () => {
    expect(reduceToDigit(23)).toBe(5);
    expect(reduceToDigit(18)).toBe(9);
    expect(reduceToDigit(11)).toBe(2);
    expect(reduceToDigit(29)).toBe(2);
    expect(reduceToDigit(9)).toBe(9);
    expect(reduceToDigit(7)).toBe(7);
  });
  it('maps a zero root to 9 (not 0)', () => {
    expect(reduceToDigit(0)).toBe(9);
    expect(reduceToDigit(18 + 9)).toBe(9); // 27 → 9
  });
});

describe('moolank / bhagyank / naamank', () => {
  it('moolank = day of month reduced', () => {
    expect(moolank(23)).toBe(5);
    expect(moolank(31)).toBe(4);
    expect(moolank(9)).toBe(9);
    expect(moolank(1)).toBe(1);
  });
  it('bhagyank = whole DOB reduced', () => {
    // 23-11-1988 → 2+3+1+1+1+9+8+8 = 33 → 6
    expect(bhagyank(23, 11, 1988)).toBe(6);
    // 15-08-1990 → 1+5+8+1+9+9+0 = 33 → 6
    expect(bhagyank(15, 8, 1990)).toBe(6);
  });
  it('naamank via Chaldean values, non-letters ignored', () => {
    expect(naamank('A')).toBe(1);   // A=1
    expect(naamank('AB')).toBe(3);  // 1+2
    expect(naamank('Cheiro')).toBe(5); // 3+5+5+1+2+7 = 23 → 5
    expect(naamank("O'Brien 42")).toBeGreaterThan(0); // punctuation/digits ignored, still letters
    expect(naamank('123')).toBe(0); // no letters
  });
});

describe('computeNumerology + briefing', () => {
  const birthMs = Date.UTC(1988, 10, 23, 0, 0, 0); // 23 Nov 1988 (IST calendar 23rd)

  it('computes the calendar parts + all three numbers', () => {
    const f = computeNumerology(birthMs, 'Ravi')!;
    expect(f.day).toBe(23);
    expect(f.month).toBe(11);
    expect(f.year).toBe(1988);
    expect(f.moolank).toBe(5);
    expect(f.bhagyank).toBe(6);
    expect(f.naamank).toBeGreaterThan(0);
  });

  it('returns null with no valid birth date', () => {
    expect(computeNumerology(null, 'Ravi')).toBeNull();
    expect(computeNumerology(undefined)).toBeNull();
    expect(buildNumerologyBriefing(null, 'Ravi')).toBeNull();
  });

  it('briefing names the three numbers, their planets, and the method', () => {
    const b = buildNumerologyBriefing(birthMs, 'Ravi')!;
    expect(b).toMatch(/Moolank/);
    expect(b).toMatch(/Bhagyank/);
    expect(b).toMatch(/Naamank/);
    expect(b).toMatch(/ruled by/);
    expect(b).toMatch(/METHOD/);
    expect(b).toMatch(/never read a birth chart|houses|dashas/i);
  });
});
