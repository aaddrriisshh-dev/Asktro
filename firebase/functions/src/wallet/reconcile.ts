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
import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { db, FieldValue } from '../common/admin';
import { assertRole, badRequest, notFound } from '../common/errors';
import { assertTokenNotRevoked } from '../common/session';
import { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } from '../common/secrets';
import { fetchOrderPayments, OrderPayment } from './razorpay';
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
 *  webhook retries for the same payment update one row instead of duplicating.
 *
 *  `manualOnly` marks a dead-letter the retry job must NEVER auto-credit — used
 *  for an amount mismatch, where crediting the full plan value is exactly the
 *  wrong thing to do. Such rows are surfaced for a human to reconcile against
 *  Razorpay, not retried. */
export async function recordFailedCredit(
  p: FailedCreditParams,
  err: unknown,
  opts: { manualOnly?: boolean } = {},
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const manualOnly = opts.manualOnly === true;
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
        ...(manualOnly ? { manualOnly: true } : {}),
        ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    // Alert row (admin-readable). One per payment; refreshed on each failure.
    tx.set(db.collection('alerts').doc(`credit_${p.paymentId}`), {
      kind: manualOnly ? 'payment_amount_mismatch' : 'payment_credit_failed',
      severity: 'critical',
      message: manualOnly
        ? `MANUAL REVIEW: payment ${p.paymentId} (user ${p.userId}, order ${p.orderId}) was refused for an amount mismatch and will NOT be auto-credited: ${message}. Verify against Razorpay before crediting.`
        : `Wallet credit failed for payment ${p.paymentId} (user ${p.userId}): ${message}`,
      refId: p.paymentId,
      resolved: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  logger.error('recordFailedCredit', { paymentId: p.paymentId, userId: p.userId, orderId: p.orderId, manualOnly, error: message });
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
    // Amount-mismatch dead-letters must never be auto-credited — leave them for
    // a human to reconcile against Razorpay (the alert was already raised).
    if (d.manualOnly === true) continue;
    if ((d.attempts ?? 0) > MAX_ATTEMPTS) {
      // Exhausted automated retries → escalate ONCE to a critical, unmissable
      // alert (idempotent via the fixed alert id) and log at error so external
      // routing on the `alerts` collection / Cloud Error Reporting can page a
      // human. A captured payment stuck here is real customer money owed.
      if (!d.escalated) {
        await db.collection('alerts').doc(`credit_exhausted_${d.paymentId}`).set({
          kind: 'credit_retry_exhausted',
          severity: 'critical',
          message: `MANUAL ACTION REQUIRED: captured payment ${d.paymentId} (user ${d.userId}, order ${d.orderId}) failed to credit after ${MAX_ATTEMPTS} retries. Customer paid but wallet not credited.`,
          refId: d.paymentId,
          resolved: false,
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        await doc.ref.set({ escalated: true, escalatedAt: FieldValue.serverTimestamp() }, { merge: true });
        logger.error('reconcileFailedCredits: EXHAUSTED — manual intervention required', { paymentId: d.paymentId, userId: d.userId, orderId: d.orderId, attempts: d.attempts });
      }
      continue;
    }
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

/**
 * reconcileRechargeOrder — admin-only, on-demand "what actually happened to this
 * order?" for the Recharge Orders portal page.
 *
 * A `rechargeOrders` doc with no `creditedPaymentId` shows as "Pending", but our
 * own data can't say WHY: abandoned checkout, a declined card, or a genuinely
 * paid order whose crediting never fired. Only Razorpay knows. This asks Razorpay
 * for every payment attempt on the order and returns a plain verdict. If it finds
 * a CAPTURED payment that was never credited, it recovers it through the same
 * idempotent creditRecharge path the webhook uses — so a customer who really paid
 * gets their wallet funded and their paused chat resumed, on the spot.
 *
 * Read-only for abandoned/declined orders; money moves ONLY to recover a payment
 * Razorpay itself reports as captured. creditRecharge is idempotent (keyed by
 * paymentId + per-order), so re-checking an order can never double-credit.
 */
type Verdict = 'credited' | 'recovered' | 'paid_uncredited' | 'declined' | 'abandoned';

export const reconcileRechargeOrder = onCall(
  { secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] },
  async (req) => {
    assertRole(req, 'admin');
    await assertTokenNotRevoked(req);

    const { orderId } = (req.data ?? {}) as { orderId?: string };
    if (!orderId) badRequest('orderId is required.');

    const orderSnap = await db.collection('rechargeOrders').doc(orderId!).get();
    if (!orderSnap.exists) notFound('Recharge order not found.');
    const order = orderSnap.data()!;
    const alreadyCredited = !!order.creditedPaymentId;

    // Ask Razorpay what actually happened on this order.
    const payments = await fetchOrderPayments(RAZORPAY_KEY_ID.value(), RAZORPAY_KEY_SECRET.value(), orderId!);
    const captured = payments.find((p) => p.status === 'captured');
    const lastFailed = [...payments].reverse().find((p) => p.status === 'failed');

    let verdict: Verdict;
    let recovered: { walletCreditPaise: number; bonusPaise: number } | null = null;

    if (alreadyCredited) {
      verdict = 'credited';
    } else if (captured) {
      // Real money we never credited. Recover it through the idempotent path.
      const result = await creditRecharge({
        userId: order.userId as string,
        paymentId: captured.id,
        orderId: orderId!,
        planId: order.planId as string,
        couponId: (order.couponId as string | null) ?? null,
        source: 'callable',
      });
      if (result.credited) {
        await autoResumePausedSession(order.userId as string).catch(() => null);
        verdict = 'recovered';
        recovered = { walletCreditPaise: result.walletCreditPaise, bonusPaise: result.bonusPaise };
      } else {
        // Idempotency says it's already handled — treat as credited.
        verdict = result.alreadyProcessed ? 'credited' : 'paid_uncredited';
      }
    } else if (lastFailed) {
      verdict = 'declined';
    } else {
      verdict = 'abandoned';
    }

    const summarize = (p: OrderPayment) => ({
      id: p.id,
      status: p.status,
      method: p.method,
      amountPaise: p.amount,
      reason: p.errorDescription || p.errorReason || null,
      at: p.createdAt,
    });

    return {
      orderId,
      verdict,
      attempts: payments.length,
      recovered,
      lastError: lastFailed ? (lastFailed.errorDescription || lastFailed.errorReason || 'Payment failed') : null,
      payments: payments.map(summarize),
    };
  },
);
