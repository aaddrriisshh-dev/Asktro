/**
 * Persona tests — lock the load-bearing, trust-breaking rules so a careless edit
 * can't silently ship a broken voice: portal-driven identity, age-aware address,
 * the whose-kundli rule, payment redirect, no-emoji, and the grounding stance.
 */
import { buildReadingSystem, addressGuidance, PERSONA_V5, OUTPUT_CONTRACT } from './persona';

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

describe('age-based address tiers (the personal-touch metric)', () => {
  const astro = 28; // astrologer age from the portal
  it('younger client → beta / beti, used sparingly', () => {
    expect(addressGuidance(astro, { age: 20, gender: 'male' })).toMatch(/"beta"/);
    expect(addressGuidance(astro, { age: 20, gender: 'female' })).toMatch(/"beti"/);
    expect(addressGuidance(astro, { age: 20 })).toMatch(/sparingly|not in most replies|back-to-back/i);
    expect(addressGuidance(astro, { age: 20 })).toMatch(/ELDER|younger than you/i); // states the gap
  });
  it('around same age → name + aap, no beta', () => {
    const g = addressGuidance(astro, { age: 29, gender: 'male' });
    expect(g).toMatch(/close to your age/i);
    expect(g).not.toMatch(/as "beta"/); // never recommends beta for a peer
    expect(g).not.toMatch(/Mataji|Babuji|bhaiya|didi/i);
  });
  it('moderately older but under the elder floor → name + aap, never Mataji/Babuji', () => {
    // A 40-45 astrologer must never call a 45-ish near-peer "Mataji".
    const g = addressGuidance(40, { age: 45, gender: 'female' });
    expect(g).toMatch(/close to your age/i);
    expect(g).not.toMatch(/Mataji|Babuji/i);
    // bhaiya/didi tier removed entirely
    expect(addressGuidance(28, { age: 38, gender: 'male' })).not.toMatch(/bhaiya|bhai sahab/i);
  });
  it('clearly elder (5+ older AND >=48) → Babuji (man) / Mataji (woman)', () => {
    expect(addressGuidance(42, { age: 50, gender: 'male' })).toMatch(/Babuji/);
    expect(addressGuidance(42, { age: 50, gender: 'female' })).toMatch(/Mataji/);
    expect(addressGuidance(42, { age: 50, gender: 'male' })).toMatch(/NEVER "beta"/);
    expect(addressGuidance(28, { age: 60, gender: 'female' })).toMatch(/Mataji/);
  });
  it('unknown age → plain respectful aap + name', () => {
    expect(addressGuidance(28, { name: 'X' })).toMatch(/aap.*name/i);
    expect(addressGuidance(undefined, { age: 40 })).toMatch(/aap/i);
  });
  it('flows into the built system prompt under ADDRESS', () => {
    const s = buildReadingSystem({ astrologer: { name: 'Meera', age: 28 }, client: { name: 'Suresh', age: 62, gender: 'male' }, briefing: 'x' });
    expect(s).toContain('ADDRESS:');
    expect(s).toContain('Babuji');
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
  it('output contract forbids emojis, caps bubbles to at most two, shows few-shot brevity', () => {
    expect(OUTPUT_CONTRACT).toMatch(/no emojis/i);
    expect(OUTPUT_CONTRACT).toMatch(/AT MOST TWO/i);
    expect(OUTPUT_CONTRACT).toMatch(/~200 characters/i);
    expect(OUTPUT_CONTRACT).toContain('aap kaise ho?'); // few-shot present
  });
  it('never reveals AI', () => {
    expect(PERSONA_V5).toMatch(/NEVER say or imply you are an AI/i);
  });
});
