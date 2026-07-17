/**
 * Chart-facts assembler — ProKerala JSON → clean LABELED facts.
 *
 * Architecture rule (non-negotiable): ProKerala CALCULATES the chart; the LLM
 * only INTERPRETS. We never feed the model raw JSON (it invents structure) and
 * never let it compute placements. Instead we assemble a small, stable, labeled
 * fact block — the ONLY placements the model is allowed to name (enforced again
 * by the grounding validator).
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
  signId: number; // 0-indexed rasi id
  house: number; // 1..12, computed from the Lagna (never the `position` field)
  degree: number; // degree within the sign
  retrograde: boolean;
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
  moonSignId?: number;
  sunSignId?: number;
  nakshatra?: string;
  nakshatraPada?: number;
  planets?: PlanetPlacement[];
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
    L.push('PLANETS (natal — house counted from Lagna):');
    for (const p of d.planets) {
      const vn = p.vedicName ? `/${p.vedicName}` : '';
      L.push(
        `- ${p.name}${vn}: ${sign(p.signId)}, ${ordinal(p.house)} house, ${p.degree.toFixed(1)}°${p.retrograde ? ' (retrograde)' : ''}`,
      );
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
  if (lagnaId != null) out.lagnaSignId = lagnaId;

  // Natal planets (exclude the Ascendant marker) with houses from the Lagna.
  const placements: PlanetPlacement[] = [];
  for (const p of natal) {
    const nm = nameOf(p);
    if (!nm || nm === 'Ascendant' || nm === 'Lagna') continue;
    const sid = rasiId(p);
    if (sid == null) continue;
    placements.push({
      name: nm,
      vedicName: vedicNameOf(p),
      signId: sid,
      house: lagnaId != null ? houseFrom(sid, lagnaId) : 0,
      degree: numOf(asObj(p)?.['degree']) ?? 0,
      retrograde: asObj(p)?.['is_retrograde'] === true,
    });
    if (nm === 'Moon') out.moonSignId = sid;
    if (nm === 'Sun') out.sunSignId = sid;
  }
  if (placements.length) out.planets = placements;

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
