/**
 * Grounding-guard tests — prove a fabricated placement can NEVER reach the user:
 * grounded → send; ungrounded first pass → repair (regenerate); ungrounded after
 * the retry → refuse with a safe in-character line.
 */
import { guardReply, buildCorrection, REFUSAL_MESSAGE, MAX_REPAIR_ATTEMPTS } from './guard';
import { formatChartFacts, ChartData } from './chartFacts';

const FACTS = formatChartFacts({
  name: 'Rahul',
  lagnaSignId: 7, // Scorpio
  moonSignId: 3, // Cancer
  planets: [{ name: 'Saturn', signId: 9, house: 3, degree: 6.6, retrograde: true, navamsaSignId: 10, vargottama: false, aspectsHouses: [5, 9, 12] }],
  yogas: ['Gajakesari Yoga'],
  doshas: [],
} as ChartData);

const grounded = JSON.stringify({
  messages: ['Aapka Shani 10th house mein hai, career pe focus'],
  action: 'REPLY',
  confidence: 'grounded',
});
const hallucinated = JSON.stringify({
  messages: ['Aapke Mangal dosha ki wajah se shaadi mein deri'],
  action: 'REPLY',
  confidence: 'grounded',
});

describe('guardReply', () => {
  it('sends a grounded reply as-is', () => {
    const d = guardReply(grounded, FACTS, 0);
    expect(d.verdict).toBe('send');
    expect(d.envelope?.messages[0]).toContain('Shani');
  });

  it('does NOT send a hallucination — asks for a repair on the first pass', () => {
    const d = guardReply(hallucinated, FACTS, 0);
    expect(d.verdict).toBe('repair');
    expect(d.ungrounded).toContain('planet:Mars');
    expect(d.correction).toContain('NOT present');
    // Critically: no envelope is handed out to send.
    expect(d.envelope).toBeUndefined();
  });

  it('refuses (safe fallback) if it is STILL ungrounded after the retry', () => {
    const d = guardReply(hallucinated, FACTS, MAX_REPAIR_ATTEMPTS);
    expect(d.verdict).toBe('fallback');
    expect(d.envelope?.messages).toEqual([REFUSAL_MESSAGE]);
    expect(d.envelope?.confidence).toBe('insufficient');
  });

  it('skips grounding on a no-chart turn (pure small talk)', () => {
    const smalltalk = JSON.stringify({ messages: ['Namaste 🙏 kaise hain aap?'], action: 'REPLY', confidence: 'partial' });
    const d = guardReply(smalltalk, '', 0);
    expect(d.verdict).toBe('send');
  });

  it('repairs empty/garbage output on the first pass, falls back after', () => {
    expect(guardReply('not json at all', FACTS, 0).verdict).toBe('repair');
    const exhausted = guardReply('', FACTS, MAX_REPAIR_ATTEMPTS);
    expect(exhausted.verdict).toBe('fallback');
    expect(exhausted.envelope?.messages).toEqual([REFUSAL_MESSAGE]);
  });

  it('a repaired (now-grounded) reply sends on the second pass', () => {
    // The retry came back clean → attempt=1 but grounded → send.
    const d = guardReply(grounded, FACTS, MAX_REPAIR_ATTEMPTS);
    expect(d.verdict).toBe('send');
  });
});

describe('buildCorrection', () => {
  it('names the offending factor and restates the contract', () => {
    const c = buildCorrection(['planet:Mars', 'f:kaal sarp']);
    expect(c).toContain('Mars');
    expect(c).toContain('kaal sarp');
    expect(c).toContain('insufficient');
  });
});
