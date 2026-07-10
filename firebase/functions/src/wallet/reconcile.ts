/**
 * Payment reconciliation safety net.
 *
 * The Razorpay webhook is the authoritative fallback that credits a wallet even
 * if the client dies after paying. If that credit throws (e.g. a transient
 * Firestore blip) we must NOT silently swallow the money: we record a
 * dead-letter row and raise an admin alert, then a scheduled job retries it
 * until it succeeds. This closes the "captured payment silently lost" hole.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { db, FieldValue } from '../common/admin';
import { creditRecharge, autoResumePausedSession } from './creditRecharge';

const DEAD_LETTER = 'failedWebhookCredits';
const MAX_ATTEMPTS = 10;

export interface FailedCreditParams {
  userId: string;
  paymentId: string;
  orderId: string;
  planId: string;
  couponId?: string | null;
}

/** Persist a failed credit + raise an admin alert. Keyed by paymentId so repeat
 *  webhook retries for the same payment update one row instead of duplicating. */
export async function recordFailedCredit(p: FailedCreditParams, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const ref = db.collection(DEAD_LETTER).doc(p.paymentId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    tx.set(
      ref,
      {
        userId: p.userId,
        paymentId: p.paymentId,
        orderId: p.orderId,
        planId: p.planId,
        couponId: p.couponId ?? null,
        lastError: message,
        attempts: FieldValue.increment(1),
        resolved: false,
        ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    // Alert row (admin-readable). One per payment; refreshed on each failure.
    tx.set(db.collection('alerts').doc(`credit_${p.paymentId}`), {
      kind: 'payment_credit_failed',
      severity: 'critical',
      message: `Wallet credit failed for payment ${p.paymentId} (user ${p.userId}): ${message}`,
      refId: p.paymentId,
      resolved: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  logger.error('recordFailedCredit', { paymentId: p.paymentId, userId: p.userId, orderId: p.orderId, error: message });
}

/**
 * Retry every unresolved dead-letter credit. creditRecharge is idempotent
 * (keyed on paymentId), so a retry that races a late webhook success is safe:
 * it returns alreadyProcessed and we simply mark the row resolved.
 */
export const reconcileFailedCredits = onSchedule('every 5 minutes', async () => {
  const pending = await db
    .collection(DEAD_LETTER)
    .where('resolved', '==', false)
    .limit(50)
    .get();

  for (const doc of pending.docs) {
    const d = doc.data();
    if ((d.attempts ?? 0) > MAX_ATTEMPTS) continue; // needs manual intervention; alert stays open
    try {
      const res = await creditRecharge({
        userId: d.userId,
        paymentId: d.paymentId,
        orderId: d.orderId,
        planId: d.planId,
        couponId: (d.couponId as string | null) ?? null,
        source: 'webhook',
      });
      if (res.credited || res.alreadyProcessed) {
        await autoResumePausedSession(d.userId).catch(() => {});
        await doc.ref.set({ resolved: true, resolvedAt: FieldValue.serverTimestamp() }, { merge: true });
        await db.collection('alerts').doc(`credit_${d.paymentId}`).set(
          { resolved: true, resolvedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
        logger.info('reconcileFailedCredits: recovered', { paymentId: d.paymentId, userId: d.userId });
      }
    } catch (e) {
      await doc.ref.set(
        { attempts: FieldValue.increment(1), lastError: e instanceof Error ? e.message : String(e), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      logger.error('reconcileFailedCredits: retry failed', { paymentId: d.paymentId, error: e instanceof Error ? e.message : String(e) });
    }
  }
});
