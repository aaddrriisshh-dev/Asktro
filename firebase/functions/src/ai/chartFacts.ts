/**
 * Chart-facts assembler — ProKerala JSON → clean LABELED facts.
 *
 * Architecture rule (non-negotiable): ProKerala CALCULATES the chart; the LLM
 * only INTERPRETS. We never feed the model raw JSON (it invents structure) and
 * never let it compute placements. Instead we assemble a small, stable, labeled
 * fact block — the ONLY placements the model is allowed to name (enforced again
 * by the grounding validator).
 *
 * (Uses `./vedic` for the classical rules — sign lords, dignity, aspects.)
 *
 * CRITICAL correctness rule learned from real ProKerala data: the planet-position
 * `position` field is the sign's NATURAL zodiac number (Aries=1 … Pisces=12), NOT
 * the house from the Lagna. Proof: the Ascendant reports position=9 when its house
 * is by definition 1. So houses MUST be computed here as whole-sign distance from
 * the Lagna sign. Trusting `position` as the house was a core failure mode of the
 * old WhatsApp bot — every placement was wrong.
 *
 * Assembled ONCE per person, then cached on the consultation; it is static for
 * the session (except gochar, refreshed periodically), so it sits in the prompt
 * cache. `formatChartFacts` is pure + deterministic → unit-testable in isolation.
 */

import { signLord, dignity, isStrong, aspectedHouses } from './vedic';

/** 0-indexed rasi id → English + Sanskrit sign name (ProKerala uses this order). */
export const SIGN_BY_ID: Array<{ en: string; sa: string }> = [
  { en: 'Aries', sa: 'Mesha' },
  { en: 'Taurus', sa: 'Vrishabha' },
  { en: 'Gemini', sa: 'Mithuna' },
  { en: 'Cancer', sa: 'Karka' },
  { en: 'Leo', sa: 'Simha' },
  { en: 'Virgo', sa: 'Kanya' },
  { en: 'Libra', sa: 'Tula' },
  { en: 'Scorpio', sa: 'Vrishchika' },
  { en: 'Sagittarius', sa: 'Dhanu' },
  { en: 'Capricorn', sa: 'Makara' },
  { en: 'Aquarius', sa: 'Kumbha' },
  { en: 'Pisces', sa: 'Meena' },
];

export interface PlanetPlacement {
  name: string; // "Saturn"
  vedicName?: string; // "Shani"
  signId: number; // 0-indexed rasi id (D1 Rasi chart)
  house: number; // 1..12, computed from the Lagna (never the `position` field)
  degree: number; // degree within the sign
  retrograde: boolean;
  navamsaSignId: number; // 0-indexed rasi id in the D9 Navamsa chart
  vargottama: boolean; // same sign in D1 and D9 → strong
  saptamsaSignId: number; // D7 sign (children)
  dashamsaSignId: number; // D10 sign (career)
  dignity?: string; // exalted/debilitated/own/friendly/etc. (null for nodes)
  strong?: boolean; // quick flag derived from dignity
  aspectsHouses: number[]; // houses this planet aspects by graha drishti
}

/** A house, its sign, its ruling planet, and where that ruler is placed. */
export interface HouseLord {
  house: number; // 1..12
  signId: number;
  lord: string; // ruling planet
  lordHouse: number; // house the ruler occupies (0 if unknown)
  lordDignity?: string;
}

export interface DashaLevel {
  lord: string; // "Jupiter (Guru)"
  untilIso?: string; // ISO date the period ends (server computes timing, not the LLM)
}

export interface Transit {
  name: string; // planet
  signId: number;
  houseFromMoon: number; // 1..12 from natal Moon
  houseFromLagna: number; // 1..12 from natal Lagna
  retrograde: boolean;
}

export interface ChartData {
  name?: string;
  lagnaSignId?: number;
  navamsaLagnaSignId?: number; // D9 ascendant sign
  saptamsaLagnaSignId?: number; // D7 ascendant sign
  dashamsaLagnaSignId?: number; // D10 ascendant sign
  moonSignId?: number;
  sunSignId?: number;
  nakshatra?: string;
  nakshatraPada?: number;
  planets?: PlanetPlacement[];
  houseLords?: HouseLord[];
  mahadasha?: DashaLevel;
  antardasha?: DashaLevel;
  pratyantardasha?: DashaLevel;
  transits?: Transit[];
  sadeSati?: { active: boolean; phase?: string }; // Saturn 12/1/2 from Moon
  yogas?: string[];
  doshas?: string[]; // present doshas only
}

// ---- Formatting: ChartData → labeled fact block --------------------------

/**
 * Render ChartData into the labeled facts the model consumes. Only lines we
 * actually have are emitted, so the model never sees an empty label to
 * pattern-fill. English sign name first with the Sanskrit in parens, because the
 * astrologer speaks Hinglish and users say "Makar"/"Capricorn" interchangeably;
 * the grounding validator matches both.
 */
export function formatChartFacts(d: ChartData): string {
  const L: string[] = [];
  if (d.name) L.push(`PERSON: ${d.name}`);
  if (d.lagnaSignId != null) L.push(`LAGNA (Ascendant): ${sign(d.lagnaSignId)}`);
  if (d.moonSignId != null) {
    const nk = d.nakshatra ? ` — Nakshatra ${d.nakshatra}${d.nakshatraPada ? ` pada ${d.nakshatraPada}` : ''}` : '';
    L.push(`MOON (rashi): ${sign(d.moonSignId)}${houseSuffix(d, d.moonSignId)}${nk}`);
  }
  if (d.sunSignId != null) L.push(`SUN (rashi): ${sign(d.sunSignId)}${houseSuffix(d, d.sunSignId)}`);

  if (d.planets?.length) {
    L.push('');
    L.push('PLANETS (natal — house from Lagna; dignity pre-computed):');
    for (const p of d.planets) {
      const vn = p.vedicName ? `/${p.vedicName}` : '';
      const dig = p.dignity ? `, ${p.dignity}${p.strong ? ' (strong)' : p.dignity === 'debilitated' || p.dignity === 'enemy sign' ? ' (weak)' : ''}` : '';
      const asp = p.aspectsHouses.length ? ` — aspects houses ${p.aspectsHouses.join(', ')}` : '';
      L.push(
        `- ${p.name}${vn}: ${sign(p.signId)}, ${ordinal(p.house)} house, ${p.degree.toFixed(1)}°${p.retrograde ? ' (R)' : ''}${dig}${asp}`,
      );
    }

    if (d.houseLords?.length) {
      L.push('');
      L.push('HOUSE LORDS (who rules each house & where that ruler sits):');
      for (const hl of d.houseLords) {
        const digNote = hl.lordDignity ? `, ${hl.lordDignity}` : '';
        const where = hl.lordHouse ? `in ${ordinal(hl.lordHouse)} house${digNote}` : 'position unknown';
        L.push(`- ${ordinal(hl.house)} house (${sign(hl.signId)}): lord ${hl.lord} ${where}`);
      }
    }

    // Navamsa (D9) — planetary strength + marriage. Vargottama planets flagged.
    L.push('');
    const d9Lagna = d.navamsaLagnaSignId != null ? `D9 Lagna: ${sign(d.navamsaLagnaSignId)}` : '';
    L.push(`NAVAMSA (D9 — strength & marriage). ${d9Lagna}`.trim());
    for (const p of d.planets) {
      L.push(`- ${p.name}: ${sign(p.navamsaSignId)}${p.vargottama ? ' [VARGOTTAMA — strong]' : ''}`);
    }
    const vargLagna =
      d.navamsaLagnaSignId != null && d.lagnaSignId != null && d.navamsaLagnaSignId === d.lagnaSignId;
    if (vargLagna) L.push('- Ascendant: [VARGOTTAMA Lagna — strong]');

    // D7 (children) and D10 (career) — compact one-line-per-planet divisional signs.
    if (d.saptamsaLagnaSignId != null) {
      L.push('');
      L.push(`SAPTAMSA (D7 — children). D7 Lagna: ${sign(d.saptamsaLagnaSignId)}`);
      L.push(d.planets.map((p) => `${p.name}: ${SIGN_BY_ID[p.saptamsaSignId]?.en}`).join('; '));
    }
    if (d.dashamsaLagnaSignId != null) {
      L.push('');
      L.push(`DASHAMSA (D10 — career). D10 Lagna: ${sign(d.dashamsaLagnaSignId)}`);
      L.push(d.planets.map((p) => `${p.name}: ${SIGN_BY_ID[p.dashamsaSignId]?.en}`).join('; '));
    }
  }

  const dashaBits: string[] = [];
  if (d.mahadasha) dashaBits.push(`Mahadasha ${d.mahadasha.lord}${until(d.mahadasha.untilIso)}`);
  if (d.antardasha) dashaBits.push(`Antardasha ${d.antardasha.lord}${until(d.antardasha.untilIso)}`);
  if (d.pratyantardasha) dashaBits.push(`Pratyantardasha ${d.pratyantardasha.lord}${until(d.pratyantardasha.untilIso)}`);
  if (dashaBits.length) {
    L.push('');
    L.push(`CURRENT DASHA: ${dashaBits.join('; ')}`);
  }

  if (d.transits?.length) {
    L.push('');
    L.push('GOCHAR (current transits — house counted from natal Moon):');
    for (const t of d.transits) {
      L.push(`- ${t.name}: ${sign(t.signId)}, ${ordinal(t.houseFromMoon)} from Moon${t.retrograde ? ' (retrograde)' : ''}`);
    }
    if (d.sadeSati) {
      L.push(
        d.sadeSati.active
          ? `SADE SATI: ACTIVE${d.sadeSati.phase ? ` (${d.sadeSati.phase})` : ''}`
          : 'SADE SATI: not active',
      );
    }
  }

  if (d.yogas?.length) {
    L.push('');
    L.push(`YOGAS PRESENT: ${d.yogas.join(', ')}`);
  }
  L.push(`DOSHAS: ${d.doshas?.length ? d.doshas.join(', ') : 'none detected'}`);

  L.push('');
  L.push(
    'RULE: You may name a planet/sign/house/nakshatra/yoga/dosha/dasha/transit ONLY ' +
      'if it appears above. Houses are already computed from the Lagna — use them as ' +
      'given. If a needed factor is not here, say so in-character — never invent it.',
  );
  return L.join('\n');
}

// ---- Extraction: ProKerala responses → ChartData -------------------------

/** Whole-sign house of `signId` counted from `fromSignId` (1..12). */
export function houseFrom(signId: number, fromSignId: number): number {
  return ((signId - fromSignId + 12) % 12) + 1;
}

/**
 * Navamsa (D9) sign for a point at absolute longitude (0..360). Each sign's 30°
 * splits into 9 navamsas of 3°20′; the continuous formula floor(L / (30/9)) % 12
 * is provably equivalent to the Parashari movable/fixed/dual starting rules for
 * every sign type. Pure math — no interpretation, no LLM. `signId` is the D1
 * rasi id (0-indexed), `degree` the position within that sign.
 */
export function navamsaSignId(signId: number, degree: number): number {
  const absLongitude = signId * 30 + degree;
  return Math.floor(absLongitude / (30 / 9)) % 12;
}

/** Odd sign (Aries, Gemini … = 0-indexed even) vs even sign — divisional rules key off this. */
function isOddSign(signId: number): boolean {
  return signId % 2 === 0;
}

/**
 * Saptamsa (D7 — children/progeny). Each sign → 7 parts of 30/7°. Odd signs
 * count from themselves; even signs from the 7th sign. Explicit rule (not the
 * continuous shortcut) for clarity + correctness.
 */
export function saptamsaSignId(signId: number, degree: number): number {
  const part = Math.floor(degree / (30 / 7)); // 0..6
  const start = isOddSign(signId) ? signId : (signId + 6) % 12;
  return (start + part) % 12;
}

/**
 * Dashamsa (D10 — career/status). Each sign → 10 parts of 3°. Odd signs count
 * from themselves; even signs from the 9th sign. NOTE: the continuous shortcut
 * does NOT hold here (even-sign start is the 9th, not the 7th) — must be explicit.
 */
export function dashamsaSignId(signId: number, degree: number): number {
  const part = Math.floor(degree / 3); // 0..9
  const start = isOddSign(signId) ? signId : (signId + 8) % 12;
  return (start + part) % 12;
}

export interface ProkeralaSources {
  name?: string;
  /** planet_position array from planet-position @ BIRTH datetime. */
  natalPlanets?: unknown;
  /** planet_position array from planet-position @ CURRENT datetime (gochar). */
  gocharPlanets?: unknown;
  /** `data` object from kundli/advanced (nakshatra, mangal_dosha, yogas, dashas). */
  advanced?: Record<string, unknown> | null;
  /** Epoch ms to resolve the active dasha + transits against (defaults handled by caller). */
  nowMs?: number;
}

/**
 * Build ChartData from real ProKerala responses. Houses are COMPUTED from the
 * Lagna (never read from `position`). Everything is defensive: missing pieces are
 * omitted, never guessed.
 */
export function extractChartData(s: ProkeralaSources): ChartData {
  const out: ChartData = { name: s.name };
  const natal = asArr(s.natalPlanets) ?? [];

  const asc = natal.find((p) => nameOf(p) === 'Ascendant' || nameOf(p) === 'Lagna');
  const lagnaId = rasiId(asc);
  if (lagnaId != null) {
    const ascDeg = numOf(asObj(asc)?.['degree']) ?? 0;
    out.lagnaSignId = lagnaId;
    out.navamsaLagnaSignId = navamsaSignId(lagnaId, ascDeg);
    out.saptamsaLagnaSignId = saptamsaSignId(lagnaId, ascDeg);
    out.dashamsaLagnaSignId = dashamsaSignId(lagnaId, ascDeg);
  }

  // Natal planets (exclude the Ascendant marker) with houses from the Lagna and
  // their D9 Navamsa sign (+ Vargottama when D1 and D9 signs match).
  const placements: PlanetPlacement[] = [];
  for (const p of natal) {
    const nm = nameOf(p);
    if (!nm || nm === 'Ascendant' || nm === 'Lagna') continue;
    const sid = rasiId(p);
    if (sid == null) continue;
    const deg = numOf(asObj(p)?.['degree']) ?? 0;
    const navId = navamsaSignId(sid, deg);
    const house = lagnaId != null ? houseFrom(sid, lagnaId) : 0;
    const dig = dignity(nm, sid, deg);
    placements.push({
      name: nm,
      vedicName: vedicNameOf(p),
      signId: sid,
      house,
      degree: deg,
      retrograde: asObj(p)?.['is_retrograde'] === true,
      navamsaSignId: navId,
      vargottama: navId === sid,
      saptamsaSignId: saptamsaSignId(sid, deg),
      dashamsaSignId: dashamsaSignId(sid, deg),
      dignity: dig ?? undefined,
      strong: dig ? isStrong(dig) : undefined,
      aspectsHouses: house ? aspectedHouses(nm, house) : [],
    });
    if (nm === 'Moon') out.moonSignId = sid;
    if (nm === 'Sun') out.sunSignId = sid;
  }
  if (placements.length) out.planets = placements;

  // House lords: for each of the 12 houses, the sign on it (whole-sign from
  // Lagna), its ruling planet, and which house that ruler occupies + its dignity.
  if (lagnaId != null && placements.length) {
    const houseOf = new Map(placements.map((p) => [p.name, p]));
    const lords: HouseLord[] = [];
    for (let h = 1; h <= 12; h++) {
      const signId = (lagnaId + h - 1) % 12;
      const lord = signLord(signId);
      const lp = houseOf.get(lord);
      lords.push({ house: h, signId, lord, lordHouse: lp?.house ?? 0, lordDignity: lp?.dignity });
    }
    out.houseLords = lords;
  }

  // Nakshatra + moon/sun fallback + doshas + yogas from kundli/advanced.
  const adv = s.advanced ?? {};
  const nak = asObj(adv['nakshatra_details']);
  if (nak) {
    out.nakshatra = nameOf(nak['nakshatra']) ?? out.nakshatra;
    const pada = numOf(asObj(nak['nakshatra'])?.['pada']);
    if (pada != null) out.nakshatraPada = pada;
    if (out.moonSignId == null) out.moonSignId = rasiId(nak['chandra_rasi']) ?? undefined;
    if (out.sunSignId == null) out.sunSignId = rasiId(nak['soorya_rasi']) ?? undefined;
  }

  const mangal = asObj(adv['mangal_dosha']);
  if (mangal?.['has_dosha'] === true) out.doshas = [...(out.doshas ?? []), 'Mangal Dosha'];

  const yogas = collectYogas(adv['yoga_details']);
  if (yogas.length) out.yogas = yogas;

  // Current dasha by walking the maha→antar→pratyantar tree against `now`.
  const now = s.nowMs;
  if (now != null) {
    const maha = currentPeriod(adv['dasha_periods'], now);
    if (maha) {
      out.mahadasha = dashaLevel(maha);
      const antar = currentPeriod(asObj(maha)?.['antardasha'], now);
      if (antar) {
        out.antardasha = dashaLevel(antar);
        const prat = currentPeriod(asObj(antar)?.['pratyantardasha'], now);
        if (prat) out.pratyantardasha = dashaLevel(prat);
      }
    }
  }

  // Gochar (transits) with house-from-Moon + Sade Sati.
  const gochar = asArr(s.gocharPlanets);
  if (gochar && out.moonSignId != null) {
    const moonId = out.moonSignId;
    const transits: Transit[] = [];
    for (const p of gochar) {
      const nm = nameOf(p);
      const sid = rasiId(p);
      if (!nm || nm === 'Ascendant' || nm === 'Lagna' || sid == null) continue;
      transits.push({
        name: nm,
        signId: sid,
        houseFromMoon: houseFrom(sid, moonId),
        houseFromLagna: lagnaId != null ? houseFrom(sid, lagnaId) : 0,
        retrograde: asObj(p)?.['is_retrograde'] === true,
      });
    }
    if (transits.length) out.transits = transits;
    const sat = transits.find((t) => t.name === 'Saturn');
    if (sat) out.sadeSati = sadeSatiOf(sat.houseFromMoon);
  }

  return out;
}

// ---- helpers ------------------------------------------------------------

function sign(id: number): string {
  const s = SIGN_BY_ID[id];
  return s ? `${s.en} (${s.sa})` : `sign#${id}`;
}

/** House suffix for Moon/Sun lines, if we can compute it from the Lagna. */
function houseSuffix(d: ChartData, signId: number): string {
  if (d.lagnaSignId == null) return '';
  return `, ${ordinal(houseFrom(signId, d.lagnaSignId))} house`;
}

/** Sade Sati phase from Saturn's house-from-Moon (12=rising, 1=peak, 2=setting). */
function sadeSatiOf(houseFromMoon: number): { active: boolean; phase?: string } {
  if (houseFromMoon === 12) return { active: true, phase: 'rising / first phase' };
  if (houseFromMoon === 1) return { active: true, phase: 'peak / second phase' };
  if (houseFromMoon === 2) return { active: true, phase: 'setting / final phase' };
  return { active: false };
}

function collectYogas(v: unknown): string[] {
  const groups = asArr(v) ?? [];
  const names: string[] = [];
  for (const g of groups) {
    const list = asArr(asObj(g)?.['yoga_list']) ?? [];
    for (const y of list) {
      const yo = asObj(y);
      if (yo?.['has_yoga'] === true) {
        const n = nameOf(y);
        if (n) names.push(n);
      }
    }
  }
  return names;
}

/** Find the period in a maha/antar/pratyantar list whose [start,end) contains now. */
function currentPeriod(v: unknown, nowMs: number): unknown | null {
  const list = asArr(v) ?? [];
  for (const d of list) {
    const o = asObj(d);
    const start = dateMs(o?.['start']);
    const end = dateMs(o?.['end']);
    if (start != null && end != null && start <= nowMs && nowMs < end) return d;
  }
  return null;
}

function dashaLevel(period: unknown): DashaLevel {
  const o = asObj(period) ?? {};
  const name = typeof o['name'] === 'string' ? (o['name'] as string) : 'Unknown';
  const vedic = typeof o['vedic_name'] === 'string' ? ` (${o['vedic_name']})` : '';
  return { lord: `${name}${vedic}`, untilIso: typeof o['end'] === 'string' ? (o['end'] as string) : undefined };
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function until(iso?: string): string {
  return iso ? ` (until ${iso.slice(0, 10)})` : '';
}

function asObj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}
function asArr(v: unknown): unknown[] | undefined {
  return Array.isArray(v) ? v : undefined;
}
function numOf(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function dateMs(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : t;
}
/** ProKerala nests `{id,name,...}`; pull a name (or a bare string). */
function nameOf(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  const n = asObj(v)?.['name'];
  return typeof n === 'string' && n.trim() ? n.trim() : undefined;
}
function vedicNameOf(v: unknown): string | undefined {
  const n = asObj(v)?.['vedic_name'];
  return typeof n === 'string' && n.trim() ? n.trim() : undefined;
}
/** Read a 0-indexed rasi id from a planet/sign node (`{rasi:{id}}` or `{id}`). */
function rasiId(v: unknown): number | undefined {
  const o = asObj(v);
  const r = asObj(o?.['rasi']);
  const id = numOf(r?.['id']) ?? numOf(o?.['id']);
  return id != null && id >= 0 && id <= 11 ? id : undefined;
}
