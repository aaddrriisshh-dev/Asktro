/**
 * Per-user rate limiting for abuse-prone callables (account/session creation,
 * payments, the paid ProKerala proxy). Firebase phone-auth OTP is throttled by
 * Firebase Auth itself, so it is not covered here.
 *
 * Design (audit notes):
 *  - ATOMIC: the per-window counter is incremented inside a Firestore
 *    transaction, so concurrent bursts from one key can't slip past the cap.
 *  - BOUNDED STORAGE: every counter doc carries an `expireAt`, so a Firestore
 *    TTL policy on `rateLimits.expireAt` reclaims them — the collection never
 *    grows unbounded (see PRE_LAUNCH: enable the TTL policy once).
 *  - FAILS OPEN: a limiter/infra fault must never block a legitimate paying
 *    action, so on any internal error we log and allow the call through.
 *  - GENEROUS CAPS: limits are set so a real human never reaches them; only a
 *    script draining SMS/quota/credit does.
 */
import { logger } from 'firebase-functions/v2';
import { db, Timestamp } from './admin';
import { Collections } from './collections';
import { HttpsError } from './errors';

export type RateLimitMode = 'block' | 'observe';

export interface RateRule {
  limit: number; // max calls allowed per window
  windowSec: number; // window length in seconds
  mode: RateLimitMode; // 'block' rejects over-limit; 'observe' only logs
}

// Per-action caps. 'block' = enforced. A normal user never approaches these.
export const RATE_RULES: Record<string, RateRule> = {
  createConsultation: { limit: 10, windowSec: 300, mode: 'block' }, // 10 / 5 min
  createRechargeOrder: { limit: 15, windowSec: 3600, mode: 'block' }, // 15 / hour
  verifyRecharge: { limit: 30, windowSec: 3600, mode: 'block' }, // 30 / hour
  prokeralaAstrology: { limit: 60, windowSec: 60, mode: 'block' }, // 60 / min
  purchaseKundliMatch: { limit: 20, windowSec: 3600, mode: 'block' }, // 20 / hour
  createStoreOrder: { limit: 20, windowSec: 3600, mode: 'block' }, // 20 / hour
  verifyStoreOrder: { limit: 40, windowSec: 3600, mode: 'block' }, // 40 / hour
};

const TTL_BUFFER_SEC = 120; // keep the doc a little past the window before TTL reclaim

/**
 * Enforces the cap for [action] against [key] (usually the caller's uid).
 * Throws `resource-exhausted` when over a 'block' rule; no-ops for unknown
 * actions or an empty key. Never throws for infra faults (fails open).
 */
export async function enforceRateLimit(action: string, key: string): Promise<void> {
  const rule = RATE_RULES[action];
  if (!rule || !key) return;

  const nowMs = Timestamp.now().toMillis();
  const windowMs = rule.windowSec * 1000;
  const windowStart = Math.floor(nowMs / windowMs) * windowMs;
  const ref = db.collection(Collections.rateLimits).doc(`${action}__${key}__${windowStart}`);

  let count: number;
  try {
    count = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = (snap.exists ? (snap.data()?.count as number) : 0) || 0;
      const next = current + 1;
      // Once over the cap we stop writing (the counter is already at `limit`),
      // so the window stays blocked without unbounded growth of `count`.
      if (next > rule.limit) return next;
      tx.set(
        ref,
        {
          action,
          count: next,
          windowStart: Timestamp.fromMillis(windowStart),
          expireAt: Timestamp.fromMillis(windowStart + windowMs + TTL_BUFFER_SEC * 1000),
        },
        { merge: true },
      );
      return next;
    });
  } catch (e) {
    // Fail OPEN — a limiter fault must not become an availability outage.
    logger.error('rateLimit transaction failed (allowing through)', {
      action,
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  if (count > rule.limit) {
    const meta = { action, count, limit: rule.limit, keyPrefix: key.slice(0, 8) };
    if (rule.mode === 'block') {
      logger.warn('rateLimit exceeded — blocked', meta);
      throw new HttpsError('resource-exhausted', 'Too many requests. Please wait a moment and try again.');
    }
    logger.warn('rateLimit exceeded — observed (not blocked)', meta);
  }
}
