/**
 * Vedic-math tests — the classical rules must be exactly right (a wrong dignity
 * or aspect = a wrong reading). Spot-checked against the founder's real chart.
 */
import { signLord, dignity, isStrong, aspectedHouses, THEME_KARAKA } from './vedic';

describe('signLord', () => {
  it('maps each sign to its ruler', () => {
    expect(signLord(0)).toBe('Mars'); // Aries
    expect(signLord(3)).toBe('Moon'); // Cancer
    expect(signLord(4)).toBe('Sun'); // Leo
    expect(signLord(9)).toBe('Saturn'); // Capricorn
    expect(signLord(8)).toBe('Jupiter'); // Sagittarius
  });
});

describe('dignity', () => {
  it('detects exaltation and debilitation', () => {
    expect(dignity('Saturn', 6, 10)).toBe('exalted'); // Saturn in Libra
    expect(dignity('Sun', 6, 10)).toBe('debilitated'); // Sun in Libra
    expect(dignity('Jupiter', 3, 5)).toBe('exalted'); // Jupiter in Cancer
    expect(dignity('Venus', 5, 10)).toBe('debilitated'); // Venus in Virgo
  });

  it('detects own sign and moolatrikona', () => {
    expect(dignity('Saturn', 9, 15)).toBe('own sign'); // Capricorn
    expect(dignity('Saturn', 10, 10)).toBe('moolatrikona'); // Aquarius 0-20°
    expect(dignity('Sun', 4, 10)).toBe('moolatrikona'); // Leo 0-20°
    expect(dignity('Sun', 4, 25)).toBe('own sign'); // Leo past 20° → own
  });

  it('falls back to friend/enemy/neutral via the sign lord', () => {
    // Venus in Capricorn (Saturn's sign); Saturn is Venus's friend → friendly.
    expect(dignity('Venus', 9, 10)).toBe('friendly sign');
    // Sun in Capricorn (Saturn's sign); Saturn is Sun's enemy → enemy.
    expect(dignity('Sun', 9, 10)).toBe('enemy sign');
  });

  it('returns null for nodes (no consensus dignity)', () => {
    expect(dignity('Rahu', 5, 10)).toBeNull();
    expect(dignity('Ketu', 5, 10)).toBeNull();
  });

  it('founder chart: Saturn in Capricorn is own sign (strong)', () => {
    const d = dignity('Saturn', 9, 6.6);
    expect(d).toBe('own sign');
    expect(isStrong(d)).toBe(true);
  });
});

describe('aspectedHouses (graha drishti)', () => {
  it('every planet aspects the 7th from itself', () => {
    expect(aspectedHouses('Venus', 1)).toEqual([7]);
    expect(aspectedHouses('Moon', 3)).toEqual([9]);
  });

  it('Mars aspects 4th, 7th, 8th', () => {
    // Mars in house 10 → aspects 1, 4, 5.
    expect(aspectedHouses('Mars', 10)).toEqual([1, 4, 5]);
  });

  it('Jupiter aspects 5th, 7th, 9th', () => {
    // Jupiter in house 9 → aspects 1, 3, 5.
    expect(aspectedHouses('Jupiter', 9)).toEqual([1, 3, 5]);
  });

  it('Saturn aspects 3rd, 7th, 10th', () => {
    // Saturn in house 2 → aspects 4, 8, 11.
    expect(aspectedHouses('Saturn', 2)).toEqual([4, 8, 11]);
  });

  it('nodes get the 7th only (conservative)', () => {
    expect(aspectedHouses('Rahu', 1)).toEqual([7]);
  });
});

describe('THEME_KARAKA', () => {
  it('marriage → Venus, children → Jupiter, career → Saturn', () => {
    expect(THEME_KARAKA.marriage).toBe('Venus');
    expect(THEME_KARAKA.children).toBe('Jupiter');
    expect(THEME_KARAKA.career).toBe('Saturn');
  });
});
