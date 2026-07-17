/**
 * Grounding guard — the "what do we DO when a reply is ungrounded" layer.
 *
 * Detection (validateGrounding) is useless unless a flagged reply is stopped
 * before the user sees it. This module is the gate every generated reply passes
 * through. It is pure + deterministic (no I/O): given the raw model text, the
 * chart facts, and which attempt we're on, it returns ONE decision:
 *
 *   - send     → the reply is grounded (or names no factors at all); ship it.
 *   - repair   → the reply named factors absent from the chart; regenerate ONCE
 *                with a pointed correction (the `correction` string appended to
 *                the next prompt). Cheap, and usually fixes it.
 *   - fallback → out of retries (or unparseable): drop the reading and send a
 *                safe, in-character "let me look closer" line. A fabricated
 *                placement NEVER reaches the user — honesty > sounding certain.
 *
 * The Phase 1 reply loop calls guardReply() after each generation and acts on
 * the verdict; no astrology content is ever emitted without passing here.
 */
import {
  ReplyEnvelope,
  parseEnvelope,
  validateGrounding,
  safeFallback,
} from './envelope';

export type GuardVerdict = 'send' | 'repair' | 'fallback';

export interface GuardDecision {
  verdict: GuardVerdict;
  /** The envelope to send (present for 'send' and 'fallback'). */
  envelope?: ReplyEnvelope;
  /** Correction to append to the regeneration prompt (present for 'repair'). */
  correction?: string;
  /** Canonical factors that were ungrounded (for telemetry). */
  ungrounded: string[];
  /** Parse/validation issues, for logging. */
  issues: string[];
}

/** Max regeneration attempts before we refuse and fall back. */
export const MAX_REPAIR_ATTEMPTS = 1;

/**
 * The safe, in-character line shown when we refuse to send an ungrounded
 * reading. Portal-overridable later; kept short + human. Deliberately says the
 * astrologer needs a closer look — which is what a real reader does.
 */
export const REFUSAL_MESSAGE = 'Ek minute, aapki kundli thoda aur dhyaan se dekhta hoon.';

/**
 * Decide what to do with a freshly generated reply.
 * @param raw        model output text
 * @param chartFacts the labeled facts the reply must stay grounded to ('' when
 *                   no chart is loaded yet — a pure small-talk/clarifier turn,
 *                   which names no factors and passes)
 * @param attempt    0 on the first generation, 1 after one repair, …
 */
export function guardReply(raw: string | null, chartFacts: string, attempt = 0): GuardDecision {
  const parsed = parseEnvelope(raw);
  const hasContent = parsed.envelope.messages.some((m) => m.trim().length > 0);
  const canRetry = attempt < MAX_REPAIR_ATTEMPTS;
  const refuse: GuardDecision = {
    verdict: 'fallback',
    envelope: safeFallback(REFUSAL_MESSAGE),
    ungrounded: [],
    issues: parsed.issues,
  };

  // A turn with no chart loaded yet can't name placements — skip grounding.
  const grounding = chartFacts.trim()
    ? validateGrounding(parsed.envelope.messages, chartFacts)
    : { grounded: true, ungrounded: [] as string[] };

  // TOP GATE: an ungrounded reply is never sent. Repair once, then refuse.
  // (A fabricated placement must NEVER reach the user — honesty > certainty.)
  if (!grounding.grounded) {
    if (canRetry) {
      return {
        verdict: 'repair',
        correction: buildCorrection(grounding.ungrounded),
        ungrounded: grounding.ungrounded,
        issues: parsed.issues,
      };
    }
    return { ...refuse, ungrounded: grounding.ungrounded };
  }

  // Grounded + a clean structured envelope with content → ship it.
  if (parsed.ok && hasContent) {
    return { verdict: 'send', envelope: parsed.envelope, ungrounded: [], issues: parsed.issues };
  }

  // Grounded but the parse degraded (prose instead of JSON, or empty). Prefer a
  // repair to recover the proper envelope + action routing.
  if (canRetry) {
    return {
      verdict: 'repair',
      correction: hasContent ? ENVELOPE_CORRECTION : EMPTY_CORRECTION,
      ungrounded: [],
      issues: parsed.issues,
    };
  }

  // Out of retries: salvage a grounded prose bubble if we have one; else refuse.
  if (hasContent) {
    return { verdict: 'send', envelope: parsed.envelope, ungrounded: [], issues: parsed.issues };
  }
  return refuse;
}

const EMPTY_CORRECTION =
  'Your previous output was empty or not valid JSON. Reply again with ONLY the ' +
  'JSON envelope: {"messages":[...],"action":"...","confidence":"..."}.';

const ENVELOPE_CORRECTION =
  'Your previous reply was not in the required format. Return ONLY the JSON ' +
  'envelope {"messages":[...],"action":"...","confidence":"..."} — no prose, no ' +
  'markdown outside it. Keep the same content, just wrap it correctly.';

/**
 * Build the corrective instruction appended to a regeneration. Names the exact
 * offending factors and restates the contract, so the retry is targeted rather
 * than a blind re-roll.
 */
export function buildCorrection(ungrounded: string[]): string {
  const factors = ungrounded.map(prettyFactor).join(', ');
  return (
    `Your draft named ${factors ? `"${factors}"` : 'a factor'}, which is NOT present in the ` +
    `KUNDLI DATA for this person. Rewrite your reply naming ONLY factors that appear in ` +
    `the chart facts. If the reading genuinely needs a factor that isn't there, do not ` +
    `invent it — instead say in-character that you need to look closer, and set ` +
    `"confidence":"insufficient".`
  );
}

/** Turn an internal factor key ("planet:Mars", "f:kaal sarp") into a readable name. */
function prettyFactor(key: string): string {
  const idx = key.indexOf(':');
  return idx === -1 ? key : key.slice(idx + 1);
}
