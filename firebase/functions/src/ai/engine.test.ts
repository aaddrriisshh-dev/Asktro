/**
 * Phase 0 unit tests — the "brain in isolation". No network, no emulator.
 *
 * The chart fixtures below are the FOUNDER'S REAL ProKerala data (21-09-1991,
 * 14:40, Moradabad) so the house math is verified against a real chart, not a
 * toy: Lagna Sagittarius, and the classic `position`-is-not-house trap is
 * exercised directly (Saturn's sign is Capricorn → must resolve to the 2nd
 * house from Lagna, NOT house 10 from its `position` field).
 */
import {
  formatChartFacts,
  extractChartData,
  houseFrom,
  navamsaSignId,
  saptamsaSignId,
  dashamsaSignId,
  ChartData,
  ProkeralaSources,
} from './chartFacts';
import { parseEnvelope, validateGrounding, safeFallback } from './envelope';
import { resolveModel, DEFAULT_MODELS } from './provider';

// A ProKerala planet-position node. `position` is deliberately set to the sign's
// natural number (the trap) to prove we NEVER read it as the house.
function pp(name: string, rasiId: number, rasiName: string, degree: number, retro = false, vedic?: string) {
  return {
    id: 0,
    name,
    longitude: rasiId * 30 + degree,
    is_retrograde: retro,
    position: rasiId + 1, // NATURAL sign number — the trap field
    degree,
    rasi: { id: rasiId, name: rasiName, lord: { id: 0, name: 'X', vedic_name: 'X' } },
    ...(vedic ? { vedic_name: vedic } : {}),
  };
}

// Founder's real natal chart (Lagna Sagittarius/Dhanu id 8).
const NATAL = [
  pp('Sun', 5, 'Kanya', 4.2),
  pp('Moon', 10, 'Kumbha', 4.1),
  pp('Mercury', 4, 'Simha', 23.8),
  pp('Venus', 3, 'Karka', 28.5),
  pp('Mars', 5, 'Kanya', 19.3),
  pp('Jupiter', 4, 'Simha', 8.2),
  pp('Saturn', 9, 'Makara', 6.6, true),
  pp('Rahu', 8, 'Dhanu', 21.4, true),
  pp('Ketu', 2, 'Mithuna', 21.4, true),
  pp('Ascendant', 8, 'Dhanu', 27.9),
];

// Gochar as of 2026-07-16: Saturn in Pisces (11) → 2nd from natal Moon (Kumbha 10) → Sade Sati.
const GOCHAR = [
  pp('Saturn', 11, 'Meena', 5.0),
  pp('Jupiter', 3, 'Karka', 10.0),
  pp('Rahu', 10, 'Kumbha', 12.0, true),
  pp('Ascendant', 5, 'Kanya', 1.0),
];

const ADVANCED = {
  nakshatra_details: {
    nakshatra: { id: 22, name: 'Dhanishta', pada: 4 },
    chandra_rasi: { id: 10, name: 'Kumbha' },
    soorya_rasi: { id: 5, name: 'Kanya' },
  },
  mangal_dosha: { has_dosha: false },
  yoga_details: [
    {
      name: 'Major Yogas',
      yoga_list: [
        { name: 'Gajakesari Yoga', has_yoga: true },
        { name: 'Raja Yoga', has_yoga: true },
        { name: 'Kemadruma Yoga', has_yoga: false },
      ],
    },
  ],
  dasha_periods: [
    {
      name: 'Jupiter',
      vedic_name: 'Guru',
      start: '2024-01-01T00:00:00+05:30',
      end: '2040-01-01T00:00:00+05:30',
      antardasha: [
        {
          name: 'Rahu',
          start: '2026-01-01T00:00:00+05:30',
          end: '2028-01-01T00:00:00+05:30',
          pratyantardasha: [
            { name: 'Venus', start: '2026-06-01T00:00:00+05:30', end: '2026-09-01T00:00:00+05:30' },
          ],
        },
      ],
    },
  ],
};

const SOURCES: ProkeralaSources = {
  name: 'Adrish',
  natalPlanets: NATAL,
  gocharPlanets: GOCHAR,
  advanced: ADVANCED,
  nowMs: Date.parse('2026-07-16T12:00:00+05:30'),
};

describe('houseFrom (whole-sign from Lagna)', () => {
  it('computes houses, not the position field', () => {
    // Lagna Sagittarius (8): Saturn in Capricorn (9) is the 2nd house — NOT 10.
    expect(houseFrom(9, 8)).toBe(2);
    expect(houseFrom(8, 8)).toBe(1); // Ascendant sign is always the 1st house
    expect(houseFrom(5, 8)).toBe(10); // Sun in Virgo → 10th
    expect(houseFrom(10, 8)).toBe(3); // Moon in Aquarius → 3rd
  });
});

describe('navamsaSignId (D9)', () => {
  it('matches the Parashari rule for movable/fixed/dual signs', () => {
    expect(navamsaSignId(0, 0)).toBe(0); // Aries 0° → Aries (movable starts from itself)
    expect(navamsaSignId(0, 3.34)).toBe(1); // Aries 2nd navamsa → Taurus
    expect(navamsaSignId(1, 0)).toBe(9); // Taurus (fixed) starts from Capricorn
    expect(navamsaSignId(2, 0)).toBe(6); // Gemini (dual) starts from Libra
  });
  it('computes the founder chart D9 (Saturn Capricorn 6.6° → Aquarius)', () => {
    expect(navamsaSignId(9, 6.6)).toBe(10); // Aquarius
    expect(navamsaSignId(8, 27.9)).toBe(8); // Ascendant Sagittarius 27.9° → Sagittarius (Vargottama)
  });
});

describe('saptamsaSignId (D7 — children)', () => {
  it('odd signs count from themselves, even signs from the 7th', () => {
    expect(saptamsaSignId(0, 0)).toBe(0); // Aries (odd) → Aries
    expect(saptamsaSignId(1, 0)).toBe(7); // Taurus (even) → Scorpio (7th)
  });
  it('founder Saturn Capricorn 6.6° → Leo', () => {
    expect(saptamsaSignId(9, 6.6)).toBe(4); // Leo
  });
});

describe('dashamsaSignId (D10 — career; NOT the continuous shortcut)', () => {
  it('odd signs count from themselves, even signs from the 9th', () => {
    expect(dashamsaSignId(0, 0)).toBe(0); // Aries (odd) → Aries
    expect(dashamsaSignId(1, 0)).toBe(9); // Taurus (even) → Capricorn (9th), not Aquarius
  });
  it('founder Saturn Capricorn 6.6° → Scorpio', () => {
    expect(dashamsaSignId(9, 6.6)).toBe(7); // Scorpio
  });
});

describe('extractChartData (real ProKerala shapes)', () => {
  const d = extractChartData(SOURCES);

  it('reads the Lagna from the Ascendant entry', () => {
    expect(d.lagnaSignId).toBe(8); // Sagittarius
  });

  it('computes every planet house from the Lagna (never position)', () => {
    const byName = Object.fromEntries((d.planets ?? []).map((p) => [p.name, p]));
    expect(byName['Saturn'].house).toBe(2); // the trap: NOT 10
    expect(byName['Saturn'].retrograde).toBe(true);
    expect(byName['Moon'].house).toBe(3);
    expect(byName['Sun'].house).toBe(10);
    expect(byName['Rahu'].house).toBe(1);
    expect(byName['Ketu'].house).toBe(7);
    expect(d.planets).toHaveLength(9); // 9 grahas, Ascendant excluded
  });

  it('reads nakshatra + moon/sun signs', () => {
    expect(d.nakshatra).toBe('Dhanishta');
    expect(d.nakshatraPada).toBe(4);
    expect(d.moonSignId).toBe(10);
    expect(d.sunSignId).toBe(5);
  });

  it('resolves the active maha/antar/pratyantar dasha by date', () => {
    expect(d.mahadasha?.lord).toBe('Jupiter (Guru)');
    expect(d.antardasha?.lord).toBe('Rahu');
    expect(d.pratyantardasha?.lord).toBe('Venus');
  });

  it('detects Sade Sati from gochar Saturn (2nd from Moon = final phase)', () => {
    expect(d.sadeSati?.active).toBe(true);
    expect(d.sadeSati?.phase).toContain('final');
  });

  it('collects only present yogas, flags no dosha when not Manglik', () => {
    expect(d.yogas).toEqual(['Gajakesari Yoga', 'Raja Yoga']);
    expect(d.doshas ?? []).not.toContain('Mangal Dosha');
  });

  it('computes dignity + aspects per planet', () => {
    const byName = Object.fromEntries((d.planets ?? []).map((p) => [p.name, p]));
    expect(byName['Saturn'].dignity).toBe('own sign'); // Capricorn
    expect(byName['Saturn'].strong).toBe(true);
    // Saturn in the 2nd → aspects 4th, 8th, 11th (graha drishti 3/7/10).
    expect(byName['Saturn'].aspectsHouses).toEqual([4, 8, 11]);
  });

  it('computes house lords and where the ruler sits', () => {
    const byHouse = Object.fromEntries((d.houseLords ?? []).map((h) => [h.house, h]));
    // Lagna Sagittarius: 7th house is Gemini, ruled by Mercury (in Leo = 9th house).
    expect(byHouse[7].lord).toBe('Mercury');
    expect(byHouse[7].lordHouse).toBe(9);
    // 1st house Sagittarius, ruled by Jupiter (in Leo = 9th).
    expect(byHouse[1].lord).toBe('Jupiter');
    expect(byHouse[1].lordHouse).toBe(9);
  });
});

describe('formatChartFacts', () => {
  const facts = formatChartFacts(extractChartData(SOURCES));

  it('renders lagna, computed houses, dasha, gochar, sade sati, yogas + the rule', () => {
    expect(facts).toContain('LAGNA (Ascendant): Sagittarius (Dhanu)');
    expect(facts).toContain('- Saturn: Capricorn (Makara), 2nd house'); // corrected house, not 10
    expect(facts).toContain('CURRENT DASHA: Mahadasha Jupiter (Guru)');
    expect(facts).toContain('GOCHAR');
    expect(facts).toContain('SADE SATI: ACTIVE');
    expect(facts).toContain('YOGAS PRESENT: Gajakesari Yoga, Raja Yoga');
    expect(facts).toContain('DOSHAS: none detected');
    expect(facts).toContain('RULE: You may name');
  });

  it('never emits house 10 for Saturn (the position trap)', () => {
    expect(facts).not.toContain('Capricorn (Makara), 10th house');
  });

  it('omits factors we do not have', () => {
    const facts2 = formatChartFacts({ moonSignId: 3 } as ChartData);
    expect(facts2).toContain('MOON');
    expect(facts2).not.toContain('LAGNA');
    expect(facts2).not.toContain('GOCHAR');
  });
});

describe('parseEnvelope', () => {
  it('parses a clean envelope', () => {
    const r = parseEnvelope('{"messages":["Namaste 🙏"],"action":"REPLY","confidence":"grounded"}');
    expect(r.ok).toBe(true);
    expect(r.envelope.messages).toEqual(['Namaste 🙏']);
    expect(r.envelope.confidence).toBe('grounded');
  });

  it('recovers from ```json fences + leading prose', () => {
    const raw = 'Sure!\n```json\n{"messages":["haan bataiye"],"action":"REPLY","confidence":"partial"}\n```';
    expect(parseEnvelope(raw).envelope.messages).toEqual(['haan bataiye']);
  });

  it('strips markdown from bubbles (the AI tell)', () => {
    const r = parseEnvelope('{"messages":["**Shani** strong","- point"],"action":"REPLY","confidence":"grounded"}');
    expect(r.envelope.messages[0]).toBe('Shani strong');
    expect(r.envelope.messages[1]).toBe('point');
  });

  it('maps legacy READY action to REPLY and caps at 3 bubbles', () => {
    const r = parseEnvelope('{"messages":["a","b","c","d"],"action":"READY","confidence":"grounded"}');
    expect(r.envelope.action).toBe('REPLY');
    expect(r.envelope.messages).toHaveLength(3);
  });

  it('falls back safely on garbage', () => {
    const r = parseEnvelope('the model rambled with no json');
    expect(r.ok).toBe(false);
    expect(r.envelope.confidence).toBe('insufficient');
  });

  it('NEVER leaks raw JSON — salvages complete strings from truncated output', () => {
    // Thinking model ran out of tokens mid-JSON (the real production bug).
    const truncated = '{"messages":["Main bilkul theek hoon, aap sunaiye","aur bataiye kya poochh';
    const r = parseEnvelope(truncated);
    expect(r.envelope.messages).toEqual(['Main bilkul theek hoon, aap sunaiye']); // complete one kept, partial dropped
    expect(r.envelope.messages.join(' ')).not.toContain('{'); // no JSON braces reach the user
    expect(r.envelope.messages.join(' ')).not.toContain('messages');
  });

  it('refuses (empty) when even the first string is truncated', () => {
    const r = parseEnvelope('{"messages":["Main');
    expect(r.envelope.messages.every((m) => !m.includes('{'))).toBe(true);
    expect(r.envelope.messages.filter((m) => m.trim()).length).toBe(0); // → guard refuses
  });

  it('reads the abuse flag (drives warnings + session end)', () => {
    const on = parseEnvelope('{"messages":["Dekhiye, yeh baat theek nahi."],"action":"REPLY","confidence":"partial","abuse":true}');
    expect(on.envelope.abuse).toBe(true);
    const off = parseEnvelope('{"messages":["Namaste"],"action":"REPLY","confidence":"partial"}');
    expect(off.envelope.abuse).toBeFalsy();
  });

  it('carries requested person + kundli action', () => {
    const r = parseEnvelope('{"messages":["details bhejiye"],"action":"REQUEST_SECONDARY_KUNDLI","person":"wife","confidence":"partial"}');
    expect(r.envelope.action).toBe('REQUEST_SECONDARY_KUNDLI');
    expect(r.envelope.person).toBe('wife');
  });
});

describe('validateGrounding', () => {
  const facts = formatChartFacts(extractChartData(SOURCES));

  it('passes a reply naming only factors in the facts', () => {
    // Saturn (present), Capricorn (present), Sade Sati (present) — all grounded.
    const g = validateGrounding(['Aapka Shani Makar mein hai, Sade Sati chal rahi hai'], facts);
    expect(g.grounded).toBe(true);
  });

  // NOTE: a COMPLETE chart (D1 + D9 + gochar) contains all 9 planets and nearly
  // every sign somewhere, so the net's real teeth are on finite, often-absent
  // factors: fabricated yogas / doshas / nakshatras.
  it('catches a fabricated yoga not present in the chart', () => {
    // Chart has Gajakesari/Raja/Anapha/Vasi/Daridra — Kemadruma is NOT present.
    const g = validateGrounding(['Aapki kundli mein Kemadruma yoga ban raha hai'], facts);
    expect(g.grounded).toBe(false);
  });

  it('catches a fabricated dosha not in the chart', () => {
    const g = validateGrounding(['Aapki kundli mein Kaal Sarp dosha hai'], facts);
    expect(g.grounded).toBe(false);
  });

  it('does not flag ordinary non-astrology words', () => {
    const g = validateGrounding(['Aapke career aur love life dono strong, patience rakhiye'], facts);
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
