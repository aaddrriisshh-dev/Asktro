/**
 * Gender safety-net tests — the deterministic Hindi first-person conjugation fix,
 * and that the persona injects a hard gender directive. Locks the "she must never
 * flip between raha/rahi hoon" guarantee.
 */
import { conjugateGender } from './gender';
import { buildReadingSystem } from './persona';

describe('conjugateGender — first-person Hindi concord', () => {
  it('fixes feminine → masculine first-person (Latin)', () => {
    expect(conjugateGender('main aapki kundli dekh rahi hoon', 'male'))
      .toBe('main aapki kundli dekh raha hoon');
    expect(conjugateGender('main samajhti hoon', 'male')).toBe('main samajhta hoon');
  });

  it('fixes masculine → feminine first-person (Latin)', () => {
    expect(conjugateGender('main dekh raha hoon', 'female')).toBe('main dekh rahi hoon');
    expect(conjugateGender('main samajhta hoon', 'female')).toBe('main samajhti hoon');
  });

  it('fixes Devanagari first-person forms', () => {
    expect(conjugateGender('मैं देख रही हूँ', 'male')).toBe('मैं देख रहा हूँ');
    expect(conjugateGender('मैं देख रहा हूँ', 'female')).toBe('मैं देख रही हूँ');
    expect(conjugateGender('मैं करती हूँ', 'male')).toBe('मैं करता हूँ');
  });

  it('NEVER touches verbs about the client (they end in hain/ho, not hoon)', () => {
    const s = 'aap bahut mehnat karti hain, aapko safalta milegi';
    expect(conjugateGender(s, 'male')).toBe(s); // "karti hain" is the client's → unchanged
    const d = 'aap kya soch rahe ho';
    expect(conjugateGender(d, 'female')).toBe(d);
  });

  it('flips first-person FUTURE (…ungi ↔ …unga) — e.g. the tarot draw line', () => {
    expect(conjugateGender('phir main aapse cards khulwaungi', 'male'))
      .toBe('phir main aapse cards khulwaunga');
    expect(conjugateGender('main aapke cards khulwaunga', 'female'))
      .toBe('main aapke cards khulwaungi');
    expect(conjugateGender('main aapki madad karungi', 'male'))
      .toBe('main aapki madad karunga');
  });

  it('is a no-op when gender is unknown', () => {
    expect(conjugateGender('main dekh rahi hoon', undefined)).toBe('main dekh rahi hoon');
  });
});

describe('persona gender directive', () => {
  it('injects a hard male directive with the exact forms', () => {
    const s = buildReadingSystem({ astrologer: { name: 'Raghav', gender: 'male' }, briefing: 'x' });
    expect(s).toMatch(/You are MALE/);
    expect(s).toContain('dekh raha hoon');
  });
  it('injects a hard female directive', () => {
    const s = buildReadingSystem({ astrologer: { name: 'Meera', gender: 'female' }, briefing: 'x' });
    expect(s).toMatch(/You are FEMALE/);
    expect(s).toContain('dekh rahi hoon');
  });
  it('omits the directive when gender is unknown', () => {
    const s = buildReadingSystem({ astrologer: { name: 'Guru' }, briefing: 'x' });
    expect(s).not.toMatch(/YOUR GENDER/);
  });
});
