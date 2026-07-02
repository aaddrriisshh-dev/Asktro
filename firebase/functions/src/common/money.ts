/**
 * Money helpers. All balances are stored as integer **paise** to avoid
 * floating-point drift. ₹1 = 100 paise. ₹9/min = 900 paise/min = 15 paise/sec.
 *
 * These are pure functions — no Firebase — so they are unit-tested directly.
 */

export const PAISE_PER_RUPEE = 100;
export const SECONDS_PER_MINUTE = 60;

/** Convert rupees (may be fractional) to whole paise. */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * PAISE_PER_RUPEE);
}

/** Convert paise to rupees (for display / logging only). */
export function paiseToRupees(paise: number): number {
  return paise / PAISE_PER_RUPEE;
}

/**
 * Price per second in paise from a per-minute price in paise.
 * We do NOT round here; billing multiplies by whole seconds and rounds once,
 * which keeps long sessions exact (900/60 = 15 exactly for the default price,
 * and fractional prices stay accurate over the whole session).
 */
export function pricePerSecond(pricePerMinutePaise: number): number {
  return pricePerMinutePaise / SECONDS_PER_MINUTE;
}

/**
 * Charge (paise, integer) for a whole number of billed seconds. Rounds the
 * final amount once so we never accumulate sub-paise error.
 */
export function chargeForSeconds(pricePerMinutePaise: number, seconds: number): number {
  if (seconds <= 0) return 0;
  return Math.round(pricePerSecond(pricePerMinutePaise) * seconds);
}

/**
 * Seconds of talk-time affordable with a given spendable balance at a given
 * per-minute price. Floors — you only get whole seconds you can fully pay for.
 */
export function affordableSeconds(spendablePaise: number, pricePerMinutePaise: number): number {
  const pps = pricePerSecond(pricePerMinutePaise);
  if (pps <= 0) return 0;
  return Math.floor(spendablePaise / pps);
}

/** Clamp a value to be non-negative (wallets can never go below zero). */
export function clampNonNegative(value: number): number {
  return value < 0 ? 0 : value;
}
