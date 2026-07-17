/**
 * Slice Selector — assembles a tight, reasoning-ready briefing from a recipe +
 * the COMPLETE chart. This is Layer 3 (+4) of the slice assembler: it pulls only
 * the recipe's factors, resolves each to a grounded, pre-digested fact, orders
 * primary→supporting, always includes anchors (Lagna, Moon, current dasha), and
 * appends the theme's reasoning scaffold + the sub-intent focus.
 *
 * The output is what the reading model actually reads — short, sharp, and the
 * grounding validator's allowed universe. Pure + deterministic → unit-testable.
 */
import { ChartData, PlanetPlacement, SIGN_BY_ID } from './chartFacts';
import { RECIPES, SUBINTENT_FOCUS, Theme, SubIntent } from './recipes';

export interface SliceRequest {
  themes: Theme[];
  subIntent: SubIntent;
  gender?: 'male' | 'female';
  /** Direct "which yogas/doshas are in my kundli" question — include the chart's
   *  FULL detected yoga+dosha list so she can answer it straight. */
  overview?: boolean;
}

/** Assemble the briefing for a question. Multiple themes are stacked (deduped). */
export function assembleSlice(chart: ChartData, req: SliceRequest): string {
  const blocks: string[] = [anchors(chart)];
  // A yoga/dosha/overview question: surface the whole detected list up front.
  if (req.overview) blocks.push(overviewBlock(chart));
  const seen = new Set<Theme>();
  for (const theme of req.themes.length ? req.themes : ['general' as Theme]) {
    if (seen.has(theme)) continue;
    seen.add(theme);
    blocks.push(themeBlock(chart, theme, req));
  }
  blocks.push(subIntentBlock(chart, req.subIntent));
  blocks.push(
    'RULE: Speak ONLY to the factors above. They are already computed and confirmed — ' +
      'apply the METHOD, do not recompute. If something needed is not here, say so honestly.',
  );
  return blocks.filter(Boolean).join('\n\n');
}

// ---- anchors (always present) -------------------------------------------

function anchors(c: ChartData): string {
  const bits: string[] = [];
  if (c.lagnaSignId != null) bits.push(`Lagna ${sign(c.lagnaSignId)}`);
  if (c.moonSignId != null) {
    bits.push(`Moon ${sign(c.moonSignId)}${c.nakshatra ? ` (${c.nakshatra})` : ''}`);
  }
  const dasha = [c.mahadasha?.lord, c.antardasha?.lord, c.pratyantardasha?.lord].filter(Boolean).join('–');
  if (dasha) bits.push(`Now running: ${dasha} dasha`);
  if (c.sadeSati?.active) bits.push(`Sade Sati ${c.sadeSati.phase ?? 'active'}`);
  return `ANCHORS: ${bits.join(' | ')}`;
}

// ---- chart overview (yogas & doshas — the "kaun se yog" answer) ---------

/**
 * The chart's FULL detected yoga + dosha list. Only rendered for an overview /
 * "which yogas are in my kundli" question, so she can answer it directly from
 * grounded data instead of deflecting. Names notable ones; never invents.
 */
function overviewBlock(c: ChartData): string {
  const yogas = c.yogas ?? [];
  const doshas = c.doshas ?? [];
  const L: string[] = ['CHART OVERVIEW (the actual yogas & doshas in THIS kundli) —'];
  L.push(yogas.length ? `- Yogas present: ${yogas.join(', ')}` : '- Yogas: none notable in the data available.');
  L.push(doshas.length ? `- Doshas present: ${doshas.join(', ')}` : '- Doshas: none present.');
  L.push(
    'When they ask which yogas/doshas are in the kundli, answer PLAINLY from this list — '
    + 'name the notable ones and what each means in one line. Never invent a yoga not listed here.',
  );
  return L.join('\n');
}

// ---- per-theme block ----------------------------------------------------

function themeBlock(c: ChartData, theme: Theme, req: SliceRequest): string {
  const r = RECIPES[theme];
  const L: string[] = [`${theme.toUpperCase()} —`];

  // Houses, primary first.
  const houses = [...r.houses].sort((a, b) => (a.role === b.role ? 0 : a.role === 'primary' ? -1 : 1));
  for (const h of houses) {
    L.push(`- ${resolveHouse(c, h.house, h.why)}`);
  }

  // Karakas (respect gender-only significators).
  for (const k of r.karakas) {
    if (k.genderOnly && k.genderOnly !== req.gender) continue;
    const p = planet(c, k.planet);
    if (p) L.push(`- ${k.planet} (${k.why}): ${describePlanet(p, theme)}`);
  }

  // Jaimini karakas / Upapada relevant to the theme.
  for (const j of r.jaimini) {
    if (j === 'UL') {
      if (c.upapadaLagnaSignId != null) L.push(`- Upapada Lagna (marriage point): ${sign(c.upapadaLagnaSignId)}`);
    } else {
      const ck = c.charaKarakas?.find((x) => x.key === j);
      if (ck) L.push(`- ${ck.name} (${ck.means}): ${ck.planet}`);
    }
  }

  // Divisional confirmation for the theme's key planets.
  const divLine = divisionalLine(c, r.divisionals, r.karakas.map((k) => k.planet));
  if (divLine) L.push(`- ${divLine}`);

  // Relevant yogas/doshas — presence AND meaningful absence.
  const yd = yogaDoshaLine(c, r.yogasDoshas);
  if (yd) L.push(`- ${yd}`);

  L.push(`METHOD: ${r.scaffold}`);
  return L.join('\n');
}

/** Sign on a house + its lord's placement + occupants + who aspects it. */
function resolveHouse(c: ChartData, house: number, why: string): string {
  const hl = c.houseLords?.find((h) => h.house === house);
  const signName = hl ? sign(hl.signId) : '?';
  const lordBit = hl
    ? `lord ${hl.lord} in ${ordinal(hl.lordHouse)} house${hl.lordDignity ? `, ${hl.lordDignity}` : ''}`
    : 'lord unknown';
  const occupants = (c.planets ?? []).filter((p) => p.house === house).map((p) => p.name);
  const aspecting = (c.planets ?? []).filter((p) => p.aspectsHouses.includes(house)).map((p) => p.name);
  const occ = occupants.length ? `; occupied by ${occupants.join(', ')}` : '';
  const asp = aspecting.length ? `; aspected by ${aspecting.join(', ')}` : '';
  return `${ordinal(house)} house (${signName}, ${why}): ${lordBit}${occ}${asp}`;
}

function describePlanet(p: PlanetPlacement, theme: Theme): string {
  const dig = p.dignity ? `, ${p.dignity}${p.strong ? ' (strong)' : p.dignity === 'debilitated' || p.dignity === 'enemy sign' ? ' (weak)' : ''}` : '';
  const div =
    theme === 'children'
      ? `; D7 ${SIGN_BY_ID[p.saptamsaSignId]?.en}`
      : theme === 'career'
        ? `; D10 ${SIGN_BY_ID[p.dashamsaSignId]?.en}`
        : `; D9 ${SIGN_BY_ID[p.navamsaSignId]?.en}${p.vargottama ? ' (Vargottama)' : ''}`;
  return `${sign(p.signId)}, ${ordinal(p.house)} house${dig}${p.retrograde ? ', retrograde' : ''}${div}`;
}

function divisionalLine(c: ChartData, divisionals: string[], karakaNames: string[]): string {
  if (!divisionals.length || !c.planets?.length) return '';
  const d = divisionals[0];
  const lagna =
    d === 'D9'
      ? c.navamsaLagnaSignId
      : d === 'D7'
        ? c.saptamsaLagnaSignId
        : c.dashamsaLagnaSignId;
  const keyPlanet = c.planets.find((p) => karakaNames.includes(p.name));
  const keySign = keyPlanet
    ? d === 'D9'
      ? SIGN_BY_ID[keyPlanet.navamsaSignId]?.en
      : d === 'D7'
        ? SIGN_BY_ID[keyPlanet.saptamsaSignId]?.en
        : SIGN_BY_ID[keyPlanet.dashamsaSignId]?.en
    : undefined;
  const parts: string[] = [];
  if (lagna != null) parts.push(`Lagna ${sign(lagna)}`);
  if (keyPlanet && keySign) parts.push(`${keyPlanet.name} in ${keySign}`);
  return parts.length ? `${d} (confirmation): ${parts.join('; ')}` : '';
}

function yogaDoshaLine(c: ChartData, relevant: string[]): string {
  if (!relevant.length) return '';
  const present = relevant.filter((y) => (c.yogas ?? []).some((g) => g.toLowerCase().includes(y.toLowerCase())) || (c.doshas ?? []).some((g) => g.toLowerCase().includes(y.toLowerCase())));
  const absentDoshas = relevant.filter((y) => y.toLowerCase().includes('dosha') && !present.includes(y));
  const bits: string[] = [];
  if (present.length) bits.push(`present: ${present.join(', ')}`);
  if (absentDoshas.length) bits.push(`absent: ${absentDoshas.join(', ')}`);
  return bits.length ? `Yogas/doshas — ${bits.join('; ')}` : '';
}

// ---- sub-intent block ---------------------------------------------------

function subIntentBlock(c: ChartData, sub: SubIntent): string {
  const L = [`FOCUS (${sub}): ${SUBINTENT_FOCUS[sub]}`];
  if (sub === 'timing' || sub === 'current_state') {
    const dasha = [c.mahadasha, c.antardasha, c.pratyantardasha]
      .filter(Boolean)
      .map((d) => `${d!.lord}${d!.untilIso ? ` (until ${d!.untilIso.slice(0, 10)})` : ''}`)
      .join(' → ');
    if (dasha) L.push(`- Current dasha: ${dasha}`);
    const transits = (c.transits ?? [])
      .filter((t) => ['Saturn', 'Jupiter', 'Rahu'].includes(t.name))
      .map((t) => `${t.name} ${ordinal(t.houseFromMoon)} from Moon`)
      .join('; ');
    if (transits) L.push(`- Key transits: ${transits}`);
  }
  return L.join('\n');
}

// ---- small helpers ------------------------------------------------------

function planet(c: ChartData, name: string): PlanetPlacement | undefined {
  return (c.planets ?? []).find((p) => p.name === name);
}
function sign(id: number): string {
  const s = SIGN_BY_ID[id];
  return s ? `${s.en}` : `sign#${id}`;
}
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
