/**
 * Recharge flow:
 *  - createRechargeOrder (callable): server builds a Razorpay order using the
 *    amount from a real rechargePlans doc — the client never supplies amount.
 *  - verifyRecharge (callable): verifies the checkout signature and credits the
 *    wallet idempotently, then auto-resumes any paused session.
 *  - razorpayWebhook (HTTPS): authoritative fallback that credits on
 *    payment.captured even if the client dies after paying.
 */
import { onCall } from 'firebase-functions/v2/https';
import { onRequest } from 'firebase-functions/v2/https';
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { assertAuthed, badRequest, failedPrecondition, notFound } from '../common/errors';
import { enforceRateLimit } from '../common/rateLimit';
import {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET,
} from '../common/secrets';
import { createOrder, verifyPaymentSignature, verifyWebhookSignature } from './razorpay';
import { creditRecharge, autoResumePausedSession } from './creditRecharge';
import { recordFailedCredit } from './reconcile';
import { logger } from 'firebase-functions/v2';

export const createRechargeOrder = onCall(
  { secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] },
  async (req) => {
    const userId = assertAuthed(req);
    await enforceRateLimit('createRechargeOrder', userId);
    const { planId, couponId } = (req.data ?? {}) as { planId?: string; couponId?: string };
    if (!planId) badRequest('planId is required.');

    const planSnap = await db.collection(Collections.rechargePlans).doc(planId!).get();
    if (!planSnap.exists) notFound('Recharge plan not found.');
    const plan = planSnap.data()!;
    if (plan.active === false) failedPrecondition('This recharge plan is no longer available.');

    // First-recharge-only promo plans (e.g. the welcome "Triple Dhamaka" offer):
    // reject once the user has ever recharged, so the introductory bonus can't be
    // farmed. Enforced server-side — the client can never bypass it.
    if (plan.firstRechargeOnly === true) {
      const uSnap = await db.collection(Collections.users).doc(userId).get();
      const u = uSnap.data() ?? {};
      const alreadyRecharged = (u.totalRecharge ?? 0) > 0 || u.firstRechargeAt != null;
      if (alreadyRecharged) failedPrecondition('This offer is only available on your first recharge.');
    }

    const amountPaise: number = plan.amount ?? plan.walletCredit;
    const order = await createOrder(
      RAZORPAY_KEY_ID.value(),
      RAZORPAY_KEY_SECRET.value(),
      amountPaise,
      `rc_${userId.slice(0, 8)}_${planId}`,
      { userId, planId, couponId: couponId ?? '' },
    );

    // Persist the authoritative order→plan binding. BOTH verifyRecharge and the
    // razorpayWebhook read THIS doc (never the client's planId or the payment's
    // notes), so a paid ₹X order can't be redeemed as a larger plan, and a
    // client-crash-then-webhook still credits the correct plan.
    await db.collection('rechargeOrders').doc(order.id).set({
      userId,
      planId,
      couponId: couponId ?? null,
      amountPaise,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: RAZORPAY_KEY_ID.value(),
      planId,
    };
  },
);

export const verifyRecharge = onCall(
  { secrets: [RAZORPAY_KEY_SECRET] },
  async (req) => {
    const userId = assertAuthed(req);
    await enforceRateLimit('verifyRecharge', userId);
    // planId/couponId from the client are IGNORED — the authoritative plan is the
    // one recorded server-side against this order at creation time.
    const { orderId, paymentId, signature } = (req.data ?? {}) as {
      orderId?: string;
      paymentId?: string;
      signature?: string;
    };
    if (!orderId || !paymentId || !signature) {
      badRequest('orderId, paymentId, signature are required.');
    }

    const ok = verifyPaymentSignature(orderId!, paymentId!, signature!, RAZORPAY_KEY_SECRET.value());
    if (!ok) failedPrecondition('PAYMENT_SIGNATURE_INVALID');

    // Look up what was ACTUALLY ordered and paid for; never trust the client.
    const orderSnap = await db.collection('rechargeOrders').doc(orderId!).get();
    if (!orderSnap.exists) failedPrecondition('ORDER_NOT_FOUND');
    const orderRec = orderSnap.data()!;
    if (orderRec.userId !== userId) failedPrecondition('ORDER_OWNER_MISMATCH');

    const result = await creditRecharge({
      userId,
      paymentId: paymentId!,
      orderId: orderId!,
      planId: orderRec.planId as string,
      couponId: (orderRec.couponId as string | null) ?? null,
      source: 'callable',
    });

    const resumedConsultationId = result.credited || result.alreadyProcessed
      ? await autoResumePausedSession(userId).catch(() => null) // best-effort; credit already committed
      : null;

    return { ...result, resumedConsultationId };
  },
);

/**
 * Handle a `payment.captured` event — extracted so the credit resolution is
 * unit-testable without HTTP/signature plumbing. Resolves userId/planId from the
 * authoritative rechargeOrders doc (NOT the payment's notes, which Razorpay
 * leaves empty), credits idempotently, and NEVER silently drops money: an
 * unresolvable or failed credit is dead-lettered + alerted.
 */
export async function creditCapturedPayment(
  entity: { id?: string; order_id?: string; amount?: number; notes?: Record<string, unknown> },
): Promise<{ credited: boolean; deadLettered: boolean }> {
  const paymentId = entity.id;
  const orderId = entity.order_id;
  const notes = entity.notes ?? {};
  let userId = notes.userId as string | undefined;
  let planId = notes.planId as string | undefined;
  let couponId = (notes.couponId as string | undefined) || null;
  let orderAmountPaise: number | undefined;

  let lookupOk = false;
  let orderFound = false;
  if (orderId) {
    try {
      const orderSnap = await db.collection('rechargeOrders').doc(orderId).get();
      lookupOk = true;
      const rec = orderSnap.data();
      if (rec) {
        orderFound = true;
        userId = (rec.userId as string | undefined) ?? userId;
        planId = (rec.planId as string | undefined) ?? planId;
        couponId = (rec.couponId as string | null | undefined) ?? couponId;
        orderAmountPaise = rec.amountPaise as number | undefined;
      }
    } catch (e) {
      logger.error('razorpayWebhook: order lookup failed', { orderId, paymentId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Shared-account guard: this Razorpay account also serves another Asktro
  // product, so we receive ITS payment.captured events too. A capture whose
  // order isn't in our rechargeOrders (a definitive lookup that found nothing)
  // is not ours — ignore it silently. We must NOT dead-letter/alert it as lost
  // money. (A transient lookup ERROR leaves lookupOk=false and still falls
  // through to the safe dead-letter path, so genuine faults aren't swallowed.)
  if (orderId && lookupOk && !orderFound) {
    logger.info('razorpayWebhook: ignoring capture for a non-Asktro order (shared account)', { orderId, paymentId });
    return { credited: false, deadLettered: false };
  }

  // Defence in depth: the captured amount MUST match the amount we bound to the
  // order. A mismatch (e.g. a partial capture, or a tampered/foreign payment
  // pointed at this order) must NOT credit the full plan value — dead-letter it.
  if (
    typeof entity.amount === 'number' && typeof orderAmountPaise === 'number' &&
    entity.amount !== orderAmountPaise
  ) {
    if (paymentId) {
      await recordFailedCredit(
        { userId: userId ?? 'unknown', paymentId, orderId: orderId ?? 'unknown', planId: planId ?? 'unknown', couponId },
        new Error(`webhook: captured amount ${entity.amount} != order amount ${orderAmountPaise}`),
        { manualOnly: true }, // never auto-credit a mismatched capture — human reconciles it
      ).catch((re) => logger.error('webhook: recordFailedCredit ALSO failed', { paymentId, error: re instanceof Error ? re.message : String(re) }));
    }
    return { credited: false, deadLettered: true };
  }

  if (userId && planId && paymentId && orderId) {
    let credited = false;
    try {
      await creditRecharge({ userId, paymentId, orderId, planId, couponId, source: 'webhook' });
      credited = true;
    } catch (e) {
      await recordFailedCredit({ userId, paymentId, orderId, planId, couponId }, e).catch((re) =>
        logger.error('webhook: recordFailedCredit ALSO failed', { paymentId, error: re instanceof Error ? re.message : String(re) }),
      );
      return { credited: false, deadLettered: true };
    }
    // Resume runs AFTER credit committed and is best-effort — a resume failure
    // must NOT dead-letter money that was already credited (false alert).
    await autoResumePausedSession(userId).catch((re) =>
      logger.error('webhook: autoResume after credit failed (non-fatal)', { userId, paymentId, error: re instanceof Error ? re.message : String(re) }),
    );
    return { credited, deadLettered: false };
  }
  if (paymentId) {
    // Could not resolve the order → dead-letter (keyed by paymentId) + alert so a
    // late-arriving binding or manual resolve can still credit it.
    await recordFailedCredit(
      { userId: userId ?? 'unknown', paymentId, orderId: orderId ?? 'unknown', planId: planId ?? 'unknown', couponId },
      new Error('webhook: could not resolve order→user/plan binding'),
    ).catch((re) => logger.error('webhook: recordFailedCredit ALSO failed', { paymentId, error: re instanceof Error ? re.message : String(re) }));
    return { credited: false, deadLettered: true };
  }
  return { credited: false, deadLettered: false };
}

export const razorpayWebhook = onRequest(
  { secrets: [RAZORPAY_WEBHOOK_SECRET] },
  async (rawReq, res) => {
    const signature = rawReq.get('x-razorpay-signature') ?? '';
    // firebase-functions provides the raw body on req.rawBody for signature checks.
    const rawBody: string =
      (rawReq as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ??
      JSON.stringify(rawReq.body ?? {});

    if (!verifyWebhookSignature(rawBody, signature, RAZORPAY_WEBHOOK_SECRET.value())) {
      res.status(400).send('invalid signature');
      return;
    }

    if ((rawReq.body?.event as string | undefined) === 'payment.captured') {
      await creditCapturedPayment(rawReq.body?.payload?.payment?.entity ?? {});
    }
    res.status(200).send('ok');
  },
);
