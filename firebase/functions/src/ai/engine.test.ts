/**
 * Phase 0 unit tests — the "brain in isolation". No network, no emulator: prove
 * facts assembly, envelope parsing (tolerant of messy model output), and the
 * grounding net that catches hallucinated placements.
 */
import { formatChartFacts, extractChartData, ChartData } from './chartFacts';
import { parseEnvelope, validateGrounding, safeFallback } from './envelope';
import { resolveModel, DEFAULT_MODELS } from './provider';

const SAMPLE: ChartData = {
  name: 'Rahul',
  lagna: 'Scorpio',
  moonSign: 'Cancer',
  sunSign: 'Leo',
  nakshatra: 'Pushya',
  moonHouse: 9,
  mahadasha: { lord: 'Shukra (Venus)', untilIso: '2027-03-01' },
  antardasha: { lord: 'Budh (Mercury)', untilIso: '2026-08-15' },
  transits: [{ planet: 'Saturn', house: 10, note: 'career house' }],
  yogas: ['Gajakesari'],
  doshas: [],
};

describe('formatChartFacts', () => {
  it('emits labeled lines only for present factors + the grounding rule', () => {
    const facts = formatChartFacts(SAMPLE);
    expect(facts).toContain('PERSON: Rahul');
    expect(facts).toContain('LAGNA (Ascendant): Scorpio');
    expect(facts).toContain('MOON: Cancer, 9th house');
    expect(facts).toContain('CURRENT MAHADASHA: Shukra (Venus) (until 2027-03-01)');
    expect(facts).toContain('CURRENT TRANSITS: Saturn in 10th house (career house)');
    expect(facts).toContain('YOGAS PRESENT: Gajakesari');
    expect(facts).toContain('DOSHAS: none detected');
    expect(facts).toContain('RULE: You may name');
  });

  it('omits factors we do not have (no empty pattern-fill lines)', () => {
    const facts = formatChartFacts({ moonSign: 'Cancer' });
    expect(facts).toContain('MOON: Cancer');
    expect(facts).not.toContain('LAGNA');
    expect(facts).not.toContain('MAHADASHA');
  });
});

describe('extractChartData', () => {
  it('pulls nakshatra/moon/sun from birth-details shape', () => {
    const d = extractChartData({
      name: 'Priya',
      birthDetails: {
        nakshatra_details: {
          nakshatra: { name: 'Rohini' },
          chandra_rasi: { name: 'Taurus' },
          soorya_rasi: { name: 'Aries' },
        },
      },
    });
    expect(d).toMatchObject({ name: 'Priya', nakshatra: 'Rohini', moonSign: 'Taurus', sunSign: 'Aries' });
  });

  it('flags Mangal Dosha only when has_dosha is true', () => {
    const on = extractChartData({ kundli: { mangal_dosha: { has_dosha: true } } });
    expect(on.doshas).toContain('Mangal Dosha');
    const off = extractChartData({ kundli: { mangal_dosha: { has_dosha: false } } });
    expect(off.doshas ?? []).not.toContain('Mangal Dosha');
  });
});

describe('parseEnvelope', () => {
  it('parses a clean envelope', () => {
    const r = parseEnvelope('{"messages":["Namaste Rahul 🙏"],"action":"REPLY","confidence":"grounded"}');
    expect(r.ok).toBe(true);
    expect(r.envelope.messages).toEqual(['Namaste Rahul 🙏']);
    expect(r.envelope.action).toBe('REPLY');
    expect(r.envelope.confidence).toBe('grounded');
  });

  it('recovers from ```json fences + leading prose', () => {
    const raw = 'Sure!\n```json\n{"messages":["haan bataiye"],"action":"REPLY","confidence":"partial"}\n```';
    const r = parseEnvelope(raw);
    expect(r.envelope.messages).toEqual(['haan bataiye']);
    expect(r.envelope.action).toBe('REPLY');
  });

  it('strips markdown from bubbles (the AI tell)', () => {
    const r = parseEnvelope('{"messages":["**Shani** is strong","- point one"],"action":"REPLY","confidence":"grounded"}');
    expect(r.envelope.messages[0]).toBe('Shani is strong');
    expect(r.envelope.messages[1]).toBe('point one');
  });

  it('maps legacy READY action to REPLY and caps at 3 bubbles', () => {
    const r = parseEnvelope('{"messages":["a","b","c","d"],"action":"READY","confidence":"grounded"}');
    expect(r.envelope.action).toBe('REPLY');
    expect(r.envelope.messages).toHaveLength(3);
  });

  it('falls back safely on garbage', () => {
    const r = parseEnvelope('the model rambled with no json at all');
    expect(r.ok).toBe(false);
    expect(r.envelope.messages.length).toBeGreaterThan(0);
    expect(r.envelope.confidence).toBe('insufficient');
  });

  it('carries the requested person + kundli action through', () => {
    const r = parseEnvelope(
      '{"messages":["unki details bhejiye"],"action":"REQUEST_SECONDARY_KUNDLI","person":"wife","confidence":"partial"}',
    );
    expect(r.envelope.action).toBe('REQUEST_SECONDARY_KUNDLI');
    expect(r.envelope.person).toBe('wife');
  });
});

describe('validateGrounding', () => {
  const facts = formatChartFacts(SAMPLE); // Scorpio lagna, Cancer moon, Saturn, Venus, Gajakesari…

  it('passes a reply that only names factors in the facts', () => {
    const g = validateGrounding(['Aapka Shani 10th house mein hai, career pe asar'], facts);
    expect(g.grounded).toBe(true);
    expect(g.ungrounded).toHaveLength(0);
  });

  it('catches a hallucinated planet not in the chart', () => {
    // Facts have Saturn/Venus/Mercury — Mars (Mangal) is NOT present.
    const g = validateGrounding(['Aapke Mangal ki wajah se problem hai'], facts);
    expect(g.grounded).toBe(false);
    expect(g.ungrounded).toContain('planet:Mars');
  });

  it('catches a hallucinated yoga not in the chart', () => {
    const g = validateGrounding(['Aapki kundli mein Kaal Sarp dosha hai'], facts);
    expect(g.grounded).toBe(false);
  });

  it('does not flag ordinary non-astrology words', () => {
    const g = validateGrounding(['Aapke career aur love life dono strong hain, patience rakhiye'], facts);
    expect(g.grounded).toBe(true);
  });
});

describe('provider config', () => {
  it('resolves default models per tier', () => {
    expect(resolveModel('reading')).toBe(DEFAULT_MODELS.reading);
    expect(resolveModel('filler')).toBe('gemini-flash-latest');
  });

  it('honours config overrides', () => {
    expect(resolveModel('reading', { reading: 'gemini-3.1-pro-preview' })).toBe('gemini-3.1-pro-preview');
  });

  it('safeFallback is always usable', () => {
    expect(safeFallback('x').messages).toEqual(['x']);
  });
});
