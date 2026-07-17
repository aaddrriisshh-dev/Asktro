/**
 * Selector tests — the assembled marriage slice must contain the decisive
 * marriage factors (7th house, Venus, Darakaraka, Upapada, D9, Mangal status)
 * and the reasoning method, and must NOT drown in unrelated career/health data.
 * Built on the founder's real chart.
 */
import { extractChartData, ChartData, ProkeralaSources } from './chartFacts';
import { assembleSlice } from './selector';

function pp(name: string, rasiId: number, rasiName: string, degree: number, retro = false) {
  return { name, is_retrograde: retro, position: rasiId + 1, degree, rasi: { id: rasiId, name: rasiName, lord: { id: 0, name: 'X' } } };
}
const NATAL = [
  pp('Sun', 5, 'Kanya', 4.2), pp('Moon', 10, 'Kumbha', 4.1), pp('Mercury', 4, 'Simha', 23.8),
  pp('Venus', 3, 'Karka', 28.5), pp('Mars', 5, 'Kanya', 19.3), pp('Jupiter', 4, 'Simha', 8.2),
  pp('Saturn', 9, 'Makara', 6.6, true), pp('Rahu', 8, 'Dhanu', 21.4, true), pp('Ketu', 2, 'Mithuna', 21.4, true),
  pp('Ascendant', 8, 'Dhanu', 27.9),
];
const GOCHAR = [pp('Saturn', 11, 'Meena', 5), pp('Jupiter', 3, 'Karka', 10), pp('Rahu', 10, 'Kumbha', 12, true)];
const ADVANCED = {
  nakshatra_details: { nakshatra: { id: 22, name: 'Dhanishta', pada: 4 }, chandra_rasi: { id: 10, name: 'Kumbha' }, soorya_rasi: { id: 5, name: 'Kanya' } },
  mangal_dosha: { has_dosha: false },
  yoga_details: [{ yoga_list: [{ name: 'Gajakesari Yoga', has_yoga: true }, { name: 'Raja Yoga', has_yoga: true }] }],
  dasha_periods: [{ name: 'Jupiter', vedic_name: 'Guru', start: '2024-01-01T00:00:00+05:30', end: '2040-01-01T00:00:00+05:30',
    antardasha: [{ name: 'Rahu', start: '2026-01-01T00:00:00+05:30', end: '2028-06-01T00:00:00+05:30',
      pratyantardasha: [{ name: 'Venus', start: '2026-06-01T00:00:00+05:30', end: '2026-11-01T00:00:00+05:30' }] }] }],
};
const SOURCES: ProkeralaSources = { name: 'Adrish', natalPlanets: NATAL, gocharPlanets: GOCHAR, advanced: ADVANCED, nowMs: Date.parse('2026-07-16T12:00:00+05:30') };
const CHART: ChartData = extractChartData(SOURCES);

describe('assembleSlice — yoga/overview question', () => {
  it('surfaces the full detected yoga + dosha list when overview is set', () => {
    const chart: ChartData = { ...CHART, yogas: ['Gajakesari Yoga', 'Budhaditya Yoga'], doshas: ['Mangal Dosha'] };
    const slice = assembleSlice(chart, { themes: ['general'], subIntent: 'general', overview: true });
    expect(slice).toContain('CHART OVERVIEW');
    expect(slice).toContain('Gajakesari Yoga');
    expect(slice).toContain('Budhaditya Yoga');
    expect(slice).toContain('Mangal Dosha');
  });
  it('does not add the overview block for a normal question', () => {
    const slice = assembleSlice(CHART, { themes: ['career'], subIntent: 'promise' });
    expect(slice).not.toContain('CHART OVERVIEW');
  });
});

describe('assembleSlice — marriage', () => {
  const slice = assembleSlice(CHART, { themes: ['marriage'], subIntent: 'promise', gender: 'male' });

  it('always includes anchors (Lagna, Moon, current dasha)', () => {
    expect(slice).toContain('ANCHORS:');
    expect(slice).toContain('Lagna Sagittarius');
    expect(slice).toContain('Rahu–Venus dasha');
  });

  it('includes the decisive marriage factors', () => {
    expect(slice).toContain('7th house (Gemini, marriage'); // 7th house resolved
    expect(slice).toContain('Venus'); // spouse karaka
    expect(slice).toContain('Darakaraka'); // spouse significator
    expect(slice).toContain('Upapada Lagna');
    expect(slice).toContain('D9 (confirmation)');
    expect(slice).toContain('METHOD:'); // the reasoning scaffold
  });

  it('reports Mangal dosha status (absence is information)', () => {
    expect(slice).toMatch(/absent: Mangal Dosha/);
  });

  it('resolves the 7th house lord + occupant + aspects', () => {
    // 7th = Gemini, lord Mercury in 9th; Ketu occupies the 7th.
    expect(slice).toContain('lord Mercury in 9th house');
    expect(slice).toContain('occupied by Ketu');
  });

  it('excludes noise — no career/D10 block for a marriage question', () => {
    expect(slice).not.toContain('CAREER —');
    expect(slice).not.toContain('D10 (confirmation)');
    expect(slice).not.toContain('DASHAMSA');
  });

  it('for a female chart, includes Jupiter as husband significator', () => {
    const female = assembleSlice(CHART, { themes: ['marriage'], subIntent: 'promise', gender: 'female' });
    expect(female).toContain('husband significator');
    // male chart omits it
    expect(slice).not.toContain('husband significator');
  });
});

describe('assembleSlice — timing adds dasha + transits', () => {
  it('a timing sub-intent surfaces current dasha windows + key transits', () => {
    const slice = assembleSlice(CHART, { themes: ['marriage'], subIntent: 'timing', gender: 'male' });
    expect(slice).toContain('FOCUS (timing)');
    expect(slice).toContain('Current dasha:');
    expect(slice).toMatch(/Saturn \d/); // a key transit line
  });
});

describe('assembleSlice — career vs children pull different slices', () => {
  it('career slice centers the 10th + D10, children the 5th + D7', () => {
    const career = assembleSlice(CHART, { themes: ['career'], subIntent: 'promise' });
    expect(career).toContain('10th house');
    expect(career).toContain('D10 (confirmation)');
    const children = assembleSlice(CHART, { themes: ['children'], subIntent: 'promise' });
    expect(children).toContain('5th house');
    expect(children).toContain('D7 (confirmation)');
  });
});
