/**
 * Recipe-library integrity tests — the moat must be well-formed and jyotish-correct.
 * These lock the canonical significators so a careless edit can't silently break
 * a reading (e.g. dropping the 7th house from marriage).
 */
import { RECIPES, SUBINTENT_FOCUS, primaryHouses, Theme, SubIntent } from './recipes';

const THEMES: Theme[] = [
  'marriage', 'love', 'children', 'career', 'wealth', 'health', 'education', 'family', 'spiritual', 'general',
];
const SUBINTENTS: SubIntent[] = ['promise', 'timing', 'current_state', 'remedy', 'yes_no', 'general'];

describe('recipe library integrity', () => {
  it('every theme has a recipe with at least one primary house and a scaffold', () => {
    for (const t of THEMES) {
      const r = RECIPES[t];
      expect(r).toBeDefined();
      expect(r.theme).toBe(t);
      expect(primaryHouses(t).length).toBeGreaterThan(0);
      expect(r.scaffold.length).toBeGreaterThan(40);
      // Houses valid 1..12, roles valid.
      for (const h of r.houses) {
        expect(h.house).toBeGreaterThanOrEqual(1);
        expect(h.house).toBeLessThanOrEqual(12);
        expect(['primary', 'supporting']).toContain(h.role);
      }
    }
  });

  it('every sub-intent has a focus directive', () => {
    for (const s of SUBINTENTS) expect(SUBINTENT_FOCUS[s].length).toBeGreaterThan(20);
  });
});

describe('canonical significators (jyotish correctness)', () => {
  it('marriage = 7th house + Venus + Darakaraka + Upapada + D9 + Mangal Dosha', () => {
    const r = RECIPES.marriage;
    expect(primaryHouses('marriage')).toContain(7);
    expect(r.karakas.some((k) => k.planet === 'Venus' && k.role === 'primary')).toBe(true);
    expect(r.jaimini).toEqual(expect.arrayContaining(['DK', 'UL']));
    expect(r.divisionals).toContain('D9');
    expect(r.yogasDoshas).toContain('Mangal Dosha');
    // Jupiter as husband significator is female-chart only.
    expect(r.karakas.find((k) => k.planet === 'Jupiter')?.genderOnly).toBe('female');
  });

  it('children = 5th house + Jupiter + PiK + D7', () => {
    expect(primaryHouses('children')).toContain(5);
    expect(RECIPES.children.karakas[0].planet).toBe('Jupiter');
    expect(RECIPES.children.jaimini).toContain('PiK');
    expect(RECIPES.children.divisionals).toContain('D7');
  });

  it('career = 10th house + Saturn + AmK + D10', () => {
    expect(primaryHouses('career')).toContain(10);
    expect(RECIPES.career.karakas.some((k) => k.planet === 'Saturn' && k.role === 'primary')).toBe(true);
    expect(RECIPES.career.jaimini).toContain('AmK');
    expect(RECIPES.career.divisionals).toContain('D10');
  });

  it('wealth = 2nd + 11th houses (both primary)', () => {
    const ph = primaryHouses('wealth');
    expect(ph).toContain(2);
    expect(ph).toContain(11);
  });
});
