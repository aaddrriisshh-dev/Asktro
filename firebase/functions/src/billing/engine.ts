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

import { affordableSeconds, chargeForSeconds, clampNonNegative } from '../common/money';

export type WarnLevel = 0 | 1 | 2 | 3;

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
    warnLevel1Sec,
    warnLevel2Sec,
  } = input;

  const spendable = clampNonNegative(walletBalancePaise) + clampNonNegative(bonusBalancePaise);

  const elapsedMs = Math.max(0, nowMs - lastTickAtMs - Math.max(0, pausedSinceLastTickMs));
  const elapsedSec = Math.floor(elapsedMs / 1000);

  // Full charge if we had unlimited balance.
  const desiredCharge = chargeForSeconds(pricePerMinutePaise, elapsedSec);

  // Cap at spendable — you can only be billed for what you can pay.
  const chargedPaise = Math.min(desiredCharge, spendable);

  // How many whole seconds did we actually pay for?
  const billedSeconds =
    desiredCharge <= spendable
      ? elapsedSec
      : affordableSeconds(spendable, pricePerMinutePaise);

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
