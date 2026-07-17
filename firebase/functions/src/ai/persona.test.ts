/**
 * Persona tests — lock the load-bearing, trust-breaking rules so a careless edit
 * can't silently ship a broken voice: portal-driven identity, age-aware address,
 * the whose-kundli rule, payment redirect, no-emoji, and the grounding stance.
 */
import { buildReadingSystem, PERSONA_V5, OUTPUT_CONTRACT } from './persona';

describe('buildReadingSystem — identity from portal', () => {
  it('injects the configured astrologer identity (name, age, gender, style)', () => {
    const s = buildReadingSystem({
      astrologer: { name: 'Meera', age: 28, gender: 'female', style: 'warm, modern, from Delhi' },
      briefing: 'ANCHORS: Lagna Sagittarius',
    });
    expect(s).toContain('You are Meera, a 28-year-old female Vedic astrologer');
    expect(s).toContain('warm, modern, from Delhi');
    expect(s).toContain('ANCHORS: Lagna Sagittarius');
  });

  it('is not hardcoded — a different astrologer produces a different identity', () => {
    const s = buildReadingSystem({ astrologer: { name: 'Raghav', age: 55, gender: 'male' }, briefing: 'x' });
    expect(s).toContain('You are Raghav, a 55-year-old male Vedic astrologer');
    expect(s).not.toContain('Meera');
  });
});

describe('age-aware address', () => {
  it('young client → beta is allowed', () => {
    const s = buildReadingSystem({ astrologer: { name: 'Meera', age: 28 }, client: { name: 'Aryan', age: 21 }, briefing: 'x' });
    expect(s).toMatch(/younger:.*beta/i);
  });
  it('older/same-age client → never beta', () => {
    const s = buildReadingSystem({ astrologer: { name: 'Meera', age: 28 }, client: { name: 'Suresh', age: 46 }, briefing: 'x' });
    expect(s).toMatch(/NOT "beta"/i);
  });
});

describe('support redirect + session greeting', () => {
  it('includes support contacts for payment questions', () => {
    const s = buildReadingSystem({ astrologer: { name: 'Meera' }, support: { whatsapp: '+91-90000-00000', email: 'help@asktro.app' }, briefing: 'x' });
    expect(s).toContain('SUPPORT');
    expect(s).toContain('help@asktro.app');
  });
  it('signals a first-message greeting vs mid-session no-greeting', () => {
    const open = buildReadingSystem({ astrologer: { name: 'Meera' }, isSessionOpening: true, briefing: 'x' });
    const mid = buildReadingSystem({ astrologer: { name: 'Meera' }, isSessionOpening: false, briefing: 'x' });
    expect(open).toMatch(/FIRST message/i);
    expect(mid).toMatch(/do NOT greet again/i);
  });
});

describe('constitution rules present (audit fixes)', () => {
  it('whose-kundli rule prevents asking for a spouse chart on a self-question', () => {
    expect(PERSONA_V5).toContain('WHOSE KUNDLI');
    expect(PERSONA_V5).toMatch(/married life.*answered from the client.s kundli ALONE/is);
  });
  it('payment/refund → support, action NONE', () => {
    expect(PERSONA_V5).toMatch(/payment.*refund.*support/is);
  });
  it('emotional playbook + balanced + timing-window rules', () => {
    expect(PERSONA_V5).toMatch(/Angry client/i);
    expect(PERSONA_V5).toMatch(/never only-sweet or only-doom/i);
    expect(PERSONA_V5).toMatch(/natural windows/i);
  });
  it('bans emojis and markdown, greets once', () => {
    expect(PERSONA_V5).toMatch(/NO markdown|never use markdown/i);
    expect(PERSONA_V5).toMatch(/EMOJIS/);
    expect(PERSONA_V5).toMatch(/Greet ONCE/i);
  });
  it('output contract forbids emojis and multi-bubble spam', () => {
    expect(OUTPUT_CONTRACT).toMatch(/NO emojis/i);
    expect(OUTPUT_CONTRACT).toMatch(/NEVER a long list of bubbles/i);
  });
  it('never reveals AI', () => {
    expect(PERSONA_V5).toMatch(/NEVER say or imply you are an AI/i);
  });
});
