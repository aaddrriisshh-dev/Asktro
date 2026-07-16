/**
 * Chart-facts assembler — ProKerala JSON → clean LABELED facts.
 *
 * Architecture rule (non-negotiable): ProKerala CALCULATES the chart; the LLM
 * only INTERPRETS. We never feed the model raw JSON (it invents structure) and
 * never let it compute placements. Instead we assemble a small, stable, labeled
 * fact block — the ONLY placements the model is allowed to name (enforced again
 * by the grounding validator).
 *
 * Assembled ONCE per person, then cached on the consultation; it is static for
 * the session, so it sits in the prompt cache (read at 0.1× after turn 1).
 *
 * `extractChartData` is defensive: ProKerala responses vary by endpoint/plan, so
 * every field is optional and missing data is simply omitted (never guessed).
 * `formatChartFacts` is pure + deterministic → unit-testable in isolation.
 */

export interface DashaPeriod {
  lord: string; // planet ruling the period, e.g. "Shukra (Venus)"
  untilIso?: string; // ISO date the period ends (server computes timing, not the LLM)
}

export interface TransitFact {
  planet: string;
  house?: number;
  sign?: string;
  note?: string; // e.g. "career house", "Sade Sati"
}

export interface ChartData {
  name?: string;
  lagna?: string; // ascendant sign
  moonSign?: string; // chandra rasi
  sunSign?: string; // soorya rasi
  nakshatra?: string;
  moonHouse?: number;
  mahadasha?: DashaPeriod;
  antardasha?: DashaPeriod;
  transits?: TransitFact[];
  yogas?: string[];
  doshas?: string[]; // present doshas only (e.g. "Mangal Dosha")
  notes?: string[]; // any extra plan-provided labeled notes
}

/**
 * Render a ChartData into the labeled fact block the model consumes. Only lines
 * we actually have are emitted, so the model never sees an empty "MOON:" it
 * might pattern-fill. The trailing rule is a belt-and-braces reminder of the
 * grounding contract right where the facts end.
 */
export function formatChartFacts(d: ChartData): string {
  const lines: string[] = [];
  if (d.name) lines.push(`PERSON: ${d.name}`);
  if (d.lagna) lines.push(`LAGNA (Ascendant): ${d.lagna}`);
  if (d.moonSign) {
    lines.push(`MOON: ${d.moonSign}${d.moonHouse ? `, ${ordinal(d.moonHouse)} house` : ''}`);
  }
  if (d.sunSign) lines.push(`SUN: ${d.sunSign}`);
  if (d.nakshatra) lines.push(`NAKSHATRA: ${d.nakshatra}`);
  if (d.mahadasha) {
    lines.push(`CURRENT MAHADASHA: ${d.mahadasha.lord}${untilClause(d.mahadasha.untilIso)}`);
  }
  if (d.antardasha) {
    lines.push(`CURRENT ANTARDASHA: ${d.antardasha.lord}${untilClause(d.antardasha.untilIso)}`);
  }
  if (d.transits?.length) {
    const t = d.transits
      .map((x) => {
        const where = x.house ? `${ordinal(x.house)} house` : x.sign ?? '';
        const note = x.note ? ` (${x.note})` : '';
        return `${x.planet}${where ? ` in ${where}` : ''}${note}`;
      })
      .join('; ');
    lines.push(`CURRENT TRANSITS: ${t}`);
  }
  if (d.yogas?.length) lines.push(`YOGAS PRESENT: ${d.yogas.join(', ')}`);
  lines.push(`DOSHAS: ${d.doshas?.length ? d.doshas.join(', ') : 'none detected'}`);
  for (const n of d.notes ?? []) lines.push(n);

  lines.push('');
  lines.push(
    'RULE: You may name a planet/sign/house/nakshatra/yoga/dosha/dasha ONLY if it ' +
      'appears above. If the needed factor is not here, say so in-character — never invent it.',
  );
  return lines.join('\n');
}

/**
 * Best-effort extraction from ProKerala responses into ChartData. Accepts the
 * merged `data` objects from birth-details + kundli/advanced (shapes vary), and
 * pulls only fields we can read confidently. Anything absent is left undefined.
 * Exact field paths are refined in Phase 1 against live responses; the formatter
 * above is the stable contract.
 */
export function extractChartData(
  sources: {
    birthDetails?: Record<string, unknown> | null;
    kundli?: Record<string, unknown> | null;
    name?: string;
  },
): ChartData {
  const out: ChartData = { name: sources.name };
  const bd = sources.birthDetails ?? {};
  const nak = asObj(bd['nakshatra_details']);
  if (nak) {
    out.nakshatra = nameOf(nak['nakshatra']);
    out.moonSign = nameOf(nak['chandra_rasi']);
    out.sunSign = nameOf(nak['soorya_rasi']);
  }

  const k = sources.kundli ?? {};
  // Ascendant / lagna — ProKerala exposes it in a few shapes across plans.
  out.lagna =
    nameOf(k['ascendant']) ??
    nameOf(asObj(k['nakshatra_details'])?.['zodiac']) ??
    out.lagna;

  // Mangal dosha (the one dosha birth-details/kundli commonly return).
  const mangal = asObj(k['mangal_dosha']) ?? asObj(bd['mangal_dosha']);
  if (mangal && mangal['has_dosha'] === true) {
    out.doshas = [...(out.doshas ?? []), 'Mangal Dosha'];
  }

  // Yoga list, when the plan returns it.
  const yogaList = asArr(k['yoga_details']) ?? asArr(k['yogas']);
  if (yogaList) {
    const names = yogaList.map((y) => nameOf(y)).filter((n): n is string => !!n);
    if (names.length) out.yogas = names;
  }

  return out;
}

// ---- helpers ------------------------------------------------------------

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function untilClause(iso?: string): string {
  return iso ? ` (until ${iso.slice(0, 10)})` : '';
}

function asObj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function asArr(v: unknown): unknown[] | undefined {
  return Array.isArray(v) ? v : undefined;
}

/** Pull a human name out of ProKerala's `{id,name,...}` shapes (or a bare string). */
function nameOf(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  const o = asObj(v);
  const n = o?.['name'];
  return typeof n === 'string' && n.trim() ? n.trim() : undefined;
}
