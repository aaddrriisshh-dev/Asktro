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
    const { planId, couponId } = (req.data ?? {}) as { planId?: string; couponId?: string };
    if (!planId) badRequest('planId is required.');

    const planSnap = await db.collection(Collections.rechargePlans).doc(planId!).get();
    if (!planSnap.exists) notFound('Recharge plan not found.');
    const plan = planSnap.data()!;
    if (plan.active === false) failedPrecondition('This recharge plan is no longer available.');

    const amountPaise: number = plan.amount ?? plan.walletCredit;
    const order = await createOrder(
      RAZORPAY_KEY_ID.value(),
      RAZORPAY_KEY_SECRET.value(),
      amountPaise,
      `rc_${userId.slice(0, 8)}_${planId}`,
      { userId, planId, couponId: couponId ?? '' },
    );

    // Persist the authoritative order→plan binding. verifyRecharge reads THIS,
    // never the client's planId, so a paid ₹X order can't be redeemed as a
    // larger plan. (The webhook uses the order's own notes for the same reason.)
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
      ? await autoResumePausedSession(userId)
      : null;

    return { ...result, resumedConsultationId };
  },
);

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

    const event = rawReq.body?.event as string | undefined;
    if (event === 'payment.captured') {
      const entity = rawReq.body?.payload?.payment?.entity ?? {};
      const notes = entity.notes ?? {};
      const userId = notes.userId as string | undefined;
      const planId = notes.planId as string | undefined;
      const couponId = (notes.couponId as string | undefined) || null;
      const paymentId = entity.id as string | undefined;
      const orderId = entity.order_id as string | undefined;

      if (userId && planId && paymentId && orderId) {
        try {
          await creditRecharge({ userId, paymentId, orderId, planId, couponId, source: 'webhook' });
          await autoResumePausedSession(userId);
        } catch (e) {
          // Do NOT silently drop the money. Record a dead-letter row + admin
          // alert so reconcileFailedCredits retries it and an operator is warned.
          // We still 200 so Razorpay doesn't hammer us, but the payment is now
          // durably tracked until it credits.
          await recordFailedCredit({ userId, paymentId, orderId, planId, couponId }, e).catch((re) =>
            logger.error('webhook: recordFailedCredit ALSO failed', { paymentId, error: re instanceof Error ? re.message : String(re) }),
          );
        }
      } else {
        logger.warn('razorpayWebhook: payment.captured missing notes', { paymentId, orderId, hasUser: !!userId, hasPlan: !!planId });
      }
    }
    res.status(200).send('ok');
  },
);
