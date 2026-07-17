/**
 * Intent-router tests — the deterministic Hinglish classifier must map real
 * user phrasings to the right theme × sub-intent, since it's both the fast path
 * and the always-safe fallback. Plus LLM-JSON validation.
 */
import { classifyIntentHeuristic, parseIntent } from './router';

describe('classifyIntentHeuristic — themes', () => {
  it('marriage phrasings (Hinglish + English)', () => {
    expect(classifyIntentHeuristic('meri shaadi kab hogi').themes).toContain('marriage');
    expect(classifyIntentHeuristic('when will I get married').themes).toContain('marriage');
    expect(classifyIntentHeuristic('mere pati se ladai ho rahi hai').themes).toContain('marriage');
  });
  it('career, children, wealth, health', () => {
    expect(classifyIntentHeuristic('naukri kab lagegi').themes).toContain('career');
    expect(classifyIntentHeuristic('will I have a baby').themes).toContain('children');
    expect(classifyIntentHeuristic('paisa kab aayega').themes).toContain('wealth');
    expect(classifyIntentHeuristic('meri sehat kaisi rahegi').themes).toContain('health');
  });
  it('defaults to general when nothing matches', () => {
    expect(classifyIntentHeuristic('namaste ji').themes).toEqual(['general']);
  });
});

describe('classifyIntentHeuristic — sub-intent', () => {
  it('kab / when → timing', () => {
    expect(classifyIntentHeuristic('shaadi kab hogi').subIntent).toBe('timing');
  });
  it('upay / remedy → remedy', () => {
    expect(classifyIntentHeuristic('iska koi upay batao').subIntent).toBe('remedy');
  });
  it('kyun / why now → current_state', () => {
    expect(classifyIntentHeuristic('abhi career me itni problem kyun chal rahi hai').subIntent).toBe('current_state');
  });
  it('kaisa / how good → promise', () => {
    expect(classifyIntentHeuristic('meri shaadi kaisi hogi').subIntent).toBe('promise');
  });
});

describe('classifyIntentHeuristic — confidence + person', () => {
  it('theme + sub-intent → high confidence', () => {
    expect(classifyIntentHeuristic('shaadi kab hogi').heuristicConfidence).toBeGreaterThanOrEqual(0.9);
  });
  it('no theme → low confidence (caller may escalate to LLM)', () => {
    expect(classifyIntentHeuristic('mujhe kuch batao').heuristicConfidence).toBeLessThan(0.5);
  });
  it('detects the partner as the subject', () => {
    expect(classifyIntentHeuristic('my wife ki tabiyat').person).toBe('partner');
  });
});

describe('parseIntent (LLM JSON validation)', () => {
  it('accepts a valid envelope', () => {
    const i = parseIntent('{"themes":["marriage"],"subIntent":"timing","person":"self"}');
    expect(i?.themes).toEqual(['marriage']);
    expect(i?.subIntent).toBe('timing');
  });
  it('drops invalid themes and rejects when none survive', () => {
    expect(parseIntent('{"themes":["nonsense"],"subIntent":"timing","person":"self"}')).toBeNull();
  });
  it('recovers from surrounding prose and defaults bad sub-intent', () => {
    const i = parseIntent('Here you go: {"themes":["career"],"subIntent":"weird","person":"x"} done');
    expect(i?.themes).toEqual(['career']);
    expect(i?.subIntent).toBe('general');
    expect(i?.person).toBe('self');
  });
  it('returns null on garbage', () => {
    expect(parseIntent('no json here')).toBeNull();
  });
});
