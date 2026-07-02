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
import { db } from '../common/admin';
import { Collections } from '../common/collections';
import { assertAuthed, badRequest, failedPrecondition, notFound } from '../common/errors';
import {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET,
} from '../common/secrets';
import { createOrder, verifyPaymentSignature, verifyWebhookSignature } from './razorpay';
import { creditRecharge, autoResumePausedSession } from './creditRecharge';

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
    const { orderId, paymentId, signature, planId, couponId } = (req.data ?? {}) as {
      orderId?: string;
      paymentId?: string;
      signature?: string;
      planId?: string;
      couponId?: string;
    };
    if (!orderId || !paymentId || !signature || !planId) {
      badRequest('orderId, paymentId, signature, planId are required.');
    }

    const ok = verifyPaymentSignature(orderId!, paymentId!, signature!, RAZORPAY_KEY_SECRET.value());
    if (!ok) failedPrecondition('PAYMENT_SIGNATURE_INVALID');

    const result = await creditRecharge({
      userId,
      paymentId: paymentId!,
      orderId: orderId!,
      planId: planId!,
      couponId: couponId ?? null,
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
          // Ack anyway to avoid retry storms; log for investigation.
          console.error('webhook credit failed', e);
        }
      }
    }
    res.status(200).send('ok');
  },
);
