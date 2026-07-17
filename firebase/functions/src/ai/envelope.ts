/**
 * The LLM output envelope — the spine of the reply engine.
 *
 * The reading model returns ONE JSON object (no prose, no markdown) shaped like:
 *   {
 *     "messages": ["short hinglish bubble", "optional 2nd"],
 *     "action":   "REPLY | REQUEST_SECONDARY_KUNDLI | REQUEST_THIRD_PERSON_KUNDLI
 *                  | REQUEST_CLARIFICATION | NONE",
 *     "person":   "wife | fiancé | son | …" (optional; who a requested kundli is for),
 *     "confidence":"grounded | partial | insufficient"
 *   }
 * `messages` render as chat bubbles with typing delays; `action` drives the
 * input card / routing; `confidence:insufficient` forces the honest
 * "mujhe aur dekhna hoga" instead of a hallucinated placement.
 *
 * This module is pure + deterministic (no I/O) so it unit-tests in isolation:
 *   raw model text → parsed, validated envelope (or a safe fallback).
 */
import { PLANETS, SIGNS, NAKSHATRAS, factorLexicon } from './lexicon';

export const ENVELOPE_ACTIONS = [
  'REPLY',
  'REQUEST_SECONDARY_KUNDLI',
  'REQUEST_THIRD_PERSON_KUNDLI',
  'REQUEST_CLARIFICATION',
  'NONE',
] as const;
export type EnvelopeAction = (typeof ENVELOPE_ACTIONS)[number];

export const CONFIDENCE_LEVELS = ['grounded', 'partial', 'insufficient'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export interface ReplyEnvelope {
  messages: string[];
  action: EnvelopeAction;
  person?: string;
  confidence: Confidence;
  /** Set true when the USER is sexually inappropriate/abusive TOWARD the astrologer
   *  (NOT a legitimate question about the user's own life). Drives the strike +
   *  session-end logic. The model judges this in context. */
  abuse?: boolean;
  /** A concrete remedy (upay) she is giving THIS turn — rendered as a saved
   *  "remedy card", not an ordinary bubble. Present only when she offers a real,
   *  actionable remedy (not for a passing mention). */
  remedy?: { title: string; note: string };
}

export interface ParseResult {
  ok: boolean;
  envelope: ReplyEnvelope;
  /** Why parsing/validation degraded, for telemetry. */
  issues: string[];
}

/** A minimal, always-safe envelope for total-failure paths. */
export function safeFallback(message: string): ReplyEnvelope {
  return { messages: [message], action: 'REPLY', confidence: 'insufficient' };
}

/**
 * Parse raw model text into a validated envelope. Tolerant of the usual model
 * sins — ```json fences, leading/trailing prose, smart quotes — because a
 * dropped turn on a paid chat is unacceptable. Returns ok:false with a fallback
 * envelope when nothing usable can be recovered; the caller logs `issues`.
 */
export function parseEnvelope(raw: string | null): ParseResult {
  const issues: string[] = [];
  if (!raw || !raw.trim()) {
    return { ok: false, envelope: safeFallback(''), issues: ['empty model output'] };
  }

  const jsonText = extractJsonObject(raw);
  if (!jsonText) {
    issues.push('no balanced JSON object found');
    // Truncated/streaming output (e.g. a thinking model cut off mid-JSON). Salvage
    // only COMPLETE message strings — NEVER emit raw JSON braces to the user.
    return { ok: false, envelope: fromSalvage(raw), issues };
  }

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    issues.push('JSON parse failed');
    return { ok: false, envelope: fromSalvage(raw), issues };
  }

  const messages = coerceMessages(obj.messages, issues);
  const action = coerceAction(obj.action, issues);
  const confidence = coerceConfidence(obj.confidence, issues);
  const person = typeof obj.person === 'string' && obj.person.trim() ? obj.person.trim() : undefined;
  const abuse = obj.abuse === true || obj.abuse === 'true';
  const remedy = coerceRemedy(obj.remedy);

  if (messages.length === 0) {
    issues.push('no usable messages');
    return { ok: false, envelope: safeFallback(''), issues };
  }

  return {
    ok: issues.length === 0,
    envelope: { messages, action, person, confidence, abuse, remedy },
    issues,
  };
}

// ---- Grounding validator (safety net over the prompt) -------------------

export interface GroundingResult {
  grounded: boolean;
  /** Chart factors the reply named that are NOT present in the facts block. */
  ungrounded: string[];
}

/**
 * Verify the reply only names chart factors that appear in the provided facts
 * block. HEURISTIC backstop — the real grounding lives in the prompt — but it
 * reliably catches the classic "hallucinated placement" (a planet/sign/
 * nakshatra/yoga/dosha the chart never had).
 *
 * Both sides are reduced to CANONICAL factors first, so Hindi/English aliases
 * match (reply "Shani" vs facts "Saturn", "Mangal" vs "Mars", "Vrishchik" vs
 * "Scorpio"). Ordinary words (career, love, patience) are never factors, so
 * free prose is never flagged. A canonical factor named in the reply but absent
 * from the facts is reported as ungrounded.
 */
export function validateGrounding(messages: string[], chartFacts: string): GroundingResult {
  const replyFactors = extractFactors(messages.join(' '));
  const factFactors = extractFactors(chartFacts);
  const ungrounded = [...replyFactors].filter((f) => !factFactors.has(f));
  return { grounded: ungrounded.length === 0, ungrounded };
}

/**
 * Reduce free text to the set of canonical chart factors it names. Planets and
 * signs collapse to a single canonical label via the lexicon aliases; one-word
 * nakshatras match on word boundaries; multi-word nakshatras / yogas / doshas
 * match as substrings (they appear inline in Hinglish prose).
 */
function extractFactors(text: string): Set<string> {
  // Reduce to lowercase alpha tokens separated by single spaces, padded — so
  // both word and phrase membership tests are clean and boundary-safe.
  const cleaned = ` ${text.toLowerCase().replace(/[^a-z]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const found = new Set<string>();
  const { phrases } = factorLexicon();

  const words = cleaned.split(' ').filter(Boolean);
  const wordSet = new Set(words);
  for (const w of words) {
    if (PLANETS[w]) found.add(`planet:${PLANETS[w]}`);
    else if (SIGNS[w]) found.add(`sign:${SIGNS[w]}`);
  }
  // One-word nakshatras: word-boundary (kept distinct from planets/signs).
  for (const nak of ONE_WORD_NAKSHATRAS) {
    if (wordSet.has(nak)) found.add(`nak:${nak}`);
  }
  // Multi-word nakshatras + yogas + doshas: phrase membership.
  for (const phrase of phrases) {
    const p = phrase.toLowerCase().replace(/[^a-z]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.includes(` ${p} `)) found.add(`f:${p}`);
  }
  return found;
}

const ONE_WORD_NAKSHATRAS = new Set(NAKSHATRAS.filter((n) => !n.includes(' ')));

// ---- helpers ------------------------------------------------------------

/**
 * Build a fallback envelope from truncated/unparseable output by salvaging only
 * the COMPLETE (fully-quoted) strings from the `messages` array. A half-written
 * last string is dropped, so the user never sees a cut-off sentence — and NEVER
 * raw JSON. If nothing complete survives, returns an empty envelope so the guard
 * refuses with the safe line.
 */
function fromSalvage(raw: string): ReplyEnvelope {
  const msgs = salvageMessages(raw);
  return msgs.length
    ? { messages: msgs, action: 'REPLY', confidence: 'partial' }
    : safeFallback('');
}

/** Pull complete quoted strings out of a (possibly truncated) `"messages":[...]`. */
function salvageMessages(raw: string): string[] {
  const key = raw.indexOf('"messages"');
  if (key === -1) return [];
  const arrStart = raw.indexOf('[', key);
  if (arrStart === -1) return [];
  const out: string[] = [];
  let i = arrStart + 1;
  while (i < raw.length && out.length < 3) {
    while (i < raw.length && raw[i] !== '"' && raw[i] !== ']') i++;
    if (i >= raw.length || raw[i] === ']') break;
    i++; // past opening quote
    let s = '';
    let closed = false;
    let esc = false;
    for (; i < raw.length; i++) {
      const ch = raw[i];
      if (esc) {
        s += ch === 'n' ? '\n' : ch;
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === '"') {
        closed = true;
        i++;
        break;
      } else {
        s += ch;
      }
    }
    if (!closed) break; // truncated last string — drop it, don't show a fragment
    const clean = stripMarkdown(s).trim();
    if (clean) out.push(clean);
  }
  return out;
}

/** Extract the first balanced {...} object from arbitrary text. */
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function coerceMessages(v: unknown, issues: string[]): string[] {
  let arr: unknown[];
  if (Array.isArray(v)) arr = v;
  else if (typeof v === 'string') {
    issues.push('messages was a string, wrapped to array');
    arr = [v];
  } else {
    issues.push('messages missing or wrong type');
    return [];
  }
  return arr
    .filter((m): m is string => typeof m === 'string')
    .map((m) => stripMarkdown(m).trim())
    .filter((m) => m.length > 0)
    .slice(0, 3); // never more than 3 bubbles in one turn
}

function coerceAction(v: unknown, issues: string[]): EnvelopeAction {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  if ((ENVELOPE_ACTIONS as readonly string[]).includes(s)) return s as EnvelopeAction;
  // Legacy/alias tolerance.
  if (s === 'READY') return 'REPLY';
  if (s) issues.push(`unknown action "${v}", defaulted to REPLY`);
  return 'REPLY';
}

/** A remedy is only real when it has a title (and usually a note). Anything
 *  malformed is dropped — a bad remedy field must never break the reply. */
function coerceRemedy(v: unknown): { title: string; note: string } | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const title = typeof o.title === 'string' ? stripMarkdown(o.title).trim() : '';
  const note = typeof o.note === 'string' ? stripMarkdown(o.note).trim() : '';
  if (!title && !note) return undefined;
  return { title: title || 'Remedy', note };
}

function coerceConfidence(v: unknown, issues: string[]): Confidence {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if ((CONFIDENCE_LEVELS as readonly string[]).includes(s)) return s as Confidence;
  if (s) issues.push(`unknown confidence "${v}", defaulted to partial`);
  return 'partial';
}

/** Strip markdown that must never reach a chat bubble (the "AI tell"). */
function stripMarkdown(s: string): string {
  return s
    .replace(/[*_`#>]+/g, '') // bold/italic/code/heading/quote markers
    .replace(/^\s*[-•]\s+/gm, '') // list bullets
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
