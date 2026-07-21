/**
 * Unit tests for the tarot draw — deterministic per (session, question), a valid
 * 3-card spread of distinct Major Arcana.
 */
import { drawSpread, buildTarotBriefing } from './tarot';

describe('drawSpread', () => {
  it('draws exactly three distinct cards in the fixed positions', () => {
    const s = drawSpread('c_1', 'will I get the job?');
    expect(s).toHaveLength(3);
    const names = s.map((c) => c.name);
    expect(new Set(names).size).toBe(3); // no duplicate cards
    expect(s[0].position).toMatch(/present/i);
    expect(s[2].position).toMatch(/heading/i);
    for (const c of s) {
      expect(typeof c.reversed).toBe('boolean');
      expect(c.meaning.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same (session, question) and varies otherwise', () => {
    const a = drawSpread('c_1', 'love?');
    const b = drawSpread('c_1', 'love?');
    expect(a).toEqual(b); // same seed → same cards + orientations (repair-safe)
    const c = drawSpread('c_1', 'career?');
    const d = drawSpread('c_2', 'love?');
    // Different question or session should (very likely) shift the draw.
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(d));
  });
});

describe('buildTarotBriefing', () => {
  it('names the three drawn cards + the method, never a chart', () => {
    const b = buildTarotBriefing('c_9', 'should I move cities?');
    expect(b).toMatch(/three-card spread/i);
    expect(b).toMatch(/upright|reversed/);
    expect(b).toMatch(/METHOD/);
    expect(b).toMatch(/never read a birth chart|houses|dashas/i);
  });
  it('handles an empty question (general reading)', () => {
    expect(buildTarotBriefing('c_9', '')).toMatch(/spread/i);
  });
});
