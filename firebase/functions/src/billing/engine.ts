/**
 * Pure billing engine — NO Firebase, NO clocks, NO I/O.
 *
 * All time and money come in as explicit arguments so this is fully
 * deterministic and unit-testable. The Cloud Function wrappers supply the
 * server timestamps and persist the results in a Firestore transaction.
 *
 * See docs/BILLING_ENGINE.md. Billing is by **elapsed server time**: exact
 * per-second charging without a per-second cron.
 */

import { affordableSeconds, clampNonNegative, pricePerSecond } from '../common/money';

export type WarnLevel = 0 | 1 | 2 | 3;

/**
 * Upper bound on the billable span of ANY single tick. A client suspended by the
 * OS that wakes and fires one catch-up tick after a long silence must never bill
 * the whole gap — only this settle window, past which the sweep pauses the
 * session. Shared by the live tick path (applyTick) and the stale-session sweep
 * so the two can never drift apart. Keep equal to sweepSessions' settle window.
 */
export const MAX_TICK_ELAPSED_MS = 15_000;

export interface TickInput {
  /** ms since epoch, from the server, of the previous billed instant. */
  lastTickAtMs: number;
  /** ms since epoch, from the server, now. */
  nowMs: number;
  /** Accumulated paused span (ms) NOT yet accounted for since lastTickAt. */
  pausedSinceLastTickMs?: number;
  /** Spendable = walletBalance + bonusBalance, in paise. */
  spendablePaise: number;
  /** Balance breakdown so we can debit bonus first. */
  walletBalancePaise: number;
  bonusBalancePaise: number;
  /** Global price snapshot for the session (paise/min). */
  pricePerMinutePaise: number;
  /** Cumulative seconds already billed on this session BEFORE this tick. */
  priorBilledSec?: number;
  /** Cumulative paise already charged on this session BEFORE this tick.
   *  Together with priorBilledSec these let us charge from the running total so
   *  rounding happens ONCE against the cumulative amount, not per tick — which
   *  is what stops the small systematic overcharge on rates not divisible by 60
   *  (e.g. ₹25/min = 41.6667 p/s). Default 0 → a single tick from zero behaves
   *  exactly as before. */
  priorChargedPaise?: number;
  /** Warn thresholds (seconds of remaining talk-time). */
  warnLevel1Sec: number;
  warnLevel2Sec: number;
}

export interface TickResult {
  /** Whole seconds billed in this tick. */
  billedSeconds: number;
  /** Paise actually charged this tick (never more than spendable). */
  chargedPaise: number;
  /** New balances after debiting bonus-first then wallet. */
  newWalletBalancePaise: number;
  newBonusBalancePaise: number;
  /** Spendable remaining after this tick. */
  remainingSpendablePaise: number;
  /** Whole seconds of talk-time the remaining balance affords. */
  remainingSec: number;
  /** Whether the balance is now exhausted → session must pause. */
  exhausted: boolean;
  /** UI warning level derived from remainingSec (or 3 if exhausted). */
  warnLevel: WarnLevel;
}

/**
 * Compute one billing tick from elapsed server time.
 *
 * Invariants enforced:
 *  - Only whole elapsed seconds (minus paused span) are billed.
 *  - You are never charged more than your spendable balance.
 *  - Bonus balance is consumed before wallet balance.
 *  - Wallet never goes negative; exhaustion flips `exhausted` for the caller
 *    to transition the session to `paused`.
 */
export function computeTick(input: TickInput): TickResult {
  const {
    lastTickAtMs,
    nowMs,
    pausedSinceLastTickMs = 0,
    walletBalancePaise,
    bonusBalancePaise,
    pricePerMinutePaise,
    priorBilledSec = 0,
    priorChargedPaise = 0,
    warnLevel1Sec,
    warnLevel2Sec,
  } = input;

  const spendable = clampNonNegative(walletBalancePaise) + clampNonNegative(bonusBalancePaise);

  const rawElapsedMs = Math.max(0, nowMs - lastTickAtMs - Math.max(0, pausedSinceLastTickMs));
  // Clamp a single tick's billable span (see MAX_TICK_ELAPSED_MS). Defence in
  // depth: applyTick already caps its frontier, but bounding it here means ANY
  // caller of the pure engine is safe from a catch-up over-bill.
  const elapsedMs = Math.min(rawElapsedMs, MAX_TICK_ELAPSED_MS);
  const elapsedSec = Math.floor(elapsedMs / 1000);

  // CUMULATIVE billing: the charge to cover N total seconds is round(pps × N),
  // computed against the running total — NOT round(pps × elapsedSec) per tick.
  // This removes the sub-paise drift that per-tick rounding accumulates on rates
  // not divisible by 60. The invariant it maintains: at all times
  // totalCharged == round(pps × totalBilledSeconds).
  const pps = pricePerSecond(pricePerMinutePaise);
  const desiredCumulative = Math.round(pps * (priorBilledSec + elapsedSec));
  const desiredChargeThisTick = Math.max(0, desiredCumulative - priorChargedPaise);

  let billedSeconds: number;
  let chargedPaise: number;
  if (desiredChargeThisTick <= spendable) {
    // Can afford the whole elapsed span.
    billedSeconds = elapsedSec;
    chargedPaise = desiredChargeThisTick;
  } else {
    // Balance runs out mid-tick — bill the most whole seconds we can fully pay
    // for, keeping the cumulative invariant. Start from the estimate then walk
    // down until the incremental charge fits within spendable.
    const affordableTotalCharge = priorChargedPaise + spendable;
    let k = pps > 0 ? Math.floor((affordableTotalCharge + 0.5) / pps - priorBilledSec) : 0;
    k = Math.max(0, Math.min(elapsedSec, k));
    while (k > 0 && Math.round(pps * (priorBilledSec + k)) - priorChargedPaise > spendable) k--;
    billedSeconds = k;
    chargedPaise = Math.min(spendable, Math.max(0, Math.round(pps * (priorBilledSec + k)) - priorChargedPaise));
  }

  // Debit bonus first, then wallet.
  const fromBonus = Math.min(bonusBalancePaise, chargedPaise);
  const fromWallet = chargedPaise - fromBonus;
  const newBonusBalancePaise = clampNonNegative(bonusBalancePaise - fromBonus);
  const newWalletBalancePaise = clampNonNegative(walletBalancePaise - fromWallet);

  const remainingSpendablePaise = newWalletBalancePaise + newBonusBalancePaise;
  const remainingSec = affordableSeconds(remainingSpendablePaise, pricePerMinutePaise);
  const exhausted = remainingSpendablePaise <= 0 || remainingSec <= 0;

  return {
    billedSeconds,
    chargedPaise,
    newWalletBalancePaise,
    newBonusBalancePaise,
    remainingSpendablePaise,
    remainingSec,
    exhausted,
    warnLevel: deriveWarnLevel(remainingSec, exhausted, warnLevel1Sec, warnLevel2Sec),
  };
}

/** Human-readable session length for a ledger note, e.g. "12m 30s", "5m", "45s". */
export function durationLabel(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
}

/** Map remaining seconds to a UI warning level (Part 4 low-balance levels). */
export function deriveWarnLevel(
  remainingSec: number,
  exhausted: boolean,
  warnLevel1Sec: number,
  warnLevel2Sec: number,
): WarnLevel {
  if (exhausted) return 3;
  if (remainingSec <= warnLevel2Sec) return 2;
  if (remainingSec <= warnLevel1Sec) return 1;
  return 0;
}

/**
 * Whether a customer can start a consultation: spendable must meet the
 * configured minimum.
 */
export function canStartConsultation(spendablePaise: number, minWalletToStartPaise: number): boolean {
  return spendablePaise >= minWalletToStartPaise && spendablePaise > 0;
}

/**
 * Astrologer net earning for a gross charge, after platform commission.
 * Returns integer paise (rounds the commission cut).
 */
export function astrologerNetEarning(grossPaise: number, commissionPercent: number): number {
  const commission = Math.round((grossPaise * commissionPercent) / 100);
  return clampNonNegative(grossPaise - commission);
}
