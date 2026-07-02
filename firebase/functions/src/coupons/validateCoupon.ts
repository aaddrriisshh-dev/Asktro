/**
 * validateCoupon — server-side validation before checkout. Checks existence,
 * active, expiry, minimum recharge, applicable plans, usage limit and per-user
 * one-time use. Returns the computed discount/bonus (paise). Never trusts the
 * client to compute the discount.
 */
import { onCall } from 'firebase-functions/v2/https';
import { db, Timestamp } from '../common/admin';
import { Collections } from '../common/collections';
import { assertAuthed, badRequest, failedPrecondition, notFound } from '../common/errors';

export const validateCoupon = onCall(async (req) => {
  const userId = assertAuthed(req);
  const { code, planId } = (req.data ?? {}) as { code?: string; planId?: string };
  if (!code) badRequest('Coupon code is required.');
  if (!planId) badRequest('planId is required.');

  const q = await db
    .collection(Collections.coupons)
    .where('code', '==', code!.trim().toUpperCase())
    .limit(1)
    .get();
  if (q.empty) notFound('COUPON_NOT_FOUND');
  const doc = q.docs[0];
  const cp = doc.data();

  if (cp.active === false) failedPrecondition('COUPON_INACTIVE');
  if (cp.expiry && (cp.expiry as Timestamp).toMillis() < Timestamp.now().toMillis()) {
    failedPrecondition('COUPON_EXPIRED');
  }

  const planSnap = await db.collection(Collections.rechargePlans).doc(planId!).get();
  if (!planSnap.exists) notFound('PLAN_NOT_FOUND');
  const plan = planSnap.data()!;
  const rechargeAmount: number = plan.amount ?? plan.walletCredit ?? 0;

  if (cp.minimumRecharge && rechargeAmount < cp.minimumRecharge) {
    failedPrecondition('MIN_RECHARGE_NOT_MET');
  }
  if (Array.isArray(cp.applicablePlans) && cp.applicablePlans.length > 0 && !cp.applicablePlans.includes(planId)) {
    failedPrecondition('COUPON_NOT_APPLICABLE_TO_PLAN');
  }

  // Global usage limit.
  if (cp.usageLimit && (cp.usedCount ?? 0) >= cp.usageLimit) {
    failedPrecondition('COUPON_USAGE_EXHAUSTED');
  }

  // Per-user one-time use.
  if (cp.perUserOnce) {
    const redeemed = await db
      .collection(Collections.couponRedemptions)
      .where('couponId', '==', doc.id)
      .where('userId', '==', userId)
      .limit(1)
      .get();
    if (!redeemed.empty) failedPrecondition('COUPON_ALREADY_USED');
  }

  const discount =
    cp.type === 'percentage'
      ? Math.min(
          Math.round((rechargeAmount * (cp.percentage ?? 0)) / 100),
          cp.maxDiscount ?? Number.MAX_SAFE_INTEGER,
        )
      : cp.amount ?? 0;

  return {
    valid: true,
    couponId: doc.id,
    code: cp.code,
    type: cp.type,
    discountPaise: discount,
  };
});
