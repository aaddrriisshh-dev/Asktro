/**
 * creditRecharge — idempotent wallet credit for a verified payment. Keyed by
 * Razorpay paymentId in `processedPayments` so the callable path and the
 * webhook path converge to exactly one credit. Applies plan bonus, optional
 * coupon discount credit, and first-recharge referral rewards, then auto-
 * resumes a paused session if any. See docs/BILLING_ENGINE.md.
 */
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { writeLedger } from './ledger';
import { readReferralCredit, applyReferralCredit } from '../referrals/referral';

export interface CreditResult {
  credited: boolean;
  alreadyProcessed: boolean;
  walletCreditPaise: number;
  bonusPaise: number;
  newBalancePaise: number;
}

export async function creditRecharge(params: {
  userId: string;
  paymentId: string;
  orderId: string;
  planId: string;
  couponId?: string | null;
  source: 'callable' | 'webhook';
}): Promise<CreditResult> {
  const { userId, paymentId, orderId, planId, couponId, source } = params;

  return db.runTransaction(async (tx) => {
    // ---- READ PHASE (Firestore requires all reads before any writes) ----
    const dedupeRef = db.collection(Collections.processedPayments).doc(paymentId);
    const dedupeSnap = await tx.get(dedupeRef);
    if (dedupeSnap.exists) {
      const prev = dedupeSnap.data()!;
      return {
        credited: false,
        alreadyProcessed: true,
        walletCreditPaise: prev.walletCreditPaise ?? 0,
        bonusPaise: prev.bonusPaise ?? 0,
        newBalancePaise: prev.newBalancePaise ?? 0,
      };
    }

    const planSnap = await tx.get(db.collection(Collections.rechargePlans).doc(planId));
    if (!planSnap.exists) throw new Error('PLAN_NOT_FOUND');
    const plan = planSnap.data()!;
    if (plan.active === false) throw new Error('PLAN_INACTIVE');

    const userRef = db.collection(Collections.users).doc(userId);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new Error('USER_NOT_FOUND');
    const user = userSnap.data()!;

    const couponRef = couponId ? db.collection(Collections.coupons).doc(couponId) : null;
    const couponSnap = couponRef ? await tx.get(couponRef) : null;

    const isFirstRecharge = (user.totalRecharge ?? 0) === 0;
    const referralCredit = isFirstRecharge && user.referredBy
      ? await readReferralCredit(tx, { referredUserId: userId, referrerCode: user.referredBy })
      : null;

    // ---- COMPUTE ----
    const walletCredit: number = plan.walletCredit ?? plan.amount ?? 0;
    let bonus: number = plan.bonus ?? 0;
    const isPaidUser = (user.totalRecharge ?? 0) > 0;

    // Optional coupon: adds extra bonus credit. Re-checks active + audience so
    // the money path is authoritative even if the client skipped validateCoupon.
    let couponBonus = 0;
    let couponApplies = false;
    if (couponSnap && couponSnap.exists) {
      const cp = couponSnap.data()!;
      const aud = (cp.audience ?? 'all') as string;
      const audienceOk = aud === 'all' || (aud === 'paid' && isPaidUser) || (aud === 'unpaid' && !isPaidUser);
      if (cp.active !== false && audienceOk) {
        couponApplies = true;
        couponBonus =
          cp.type === 'percentage'
            ? Math.min(Math.round((walletCredit * (cp.percentage ?? 0)) / 100), cp.maxDiscount ?? Number.MAX_SAFE_INTEGER)
            : (cp.amount ?? 0) + (cp.bonus ?? 0);
      }
    }
    bonus += couponBonus;

    const balanceBefore = (user.walletBalance ?? 0) + (user.bonusBalance ?? 0);
    const balanceAfter = balanceBefore + walletCredit + bonus;

    // ---- WRITE PHASE ----
    if (couponApplies && couponSnap) {
      tx.update(couponSnap.ref, { usedCount: FieldValue.increment(1) });
      tx.set(db.collection(Collections.couponRedemptions).doc(), {
        couponId,
        userId,
        paymentId,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    tx.update(userRef, {
      walletBalance: FieldValue.increment(walletCredit),
      bonusBalance: FieldValue.increment(bonus),
      totalRecharge: FieldValue.increment(walletCredit),
      // stamp the first-recharge moment so conversion analytics can measure it
      ...(isFirstRecharge ? { firstRechargeAt: FieldValue.serverTimestamp() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    writeLedger(tx, {
      userId,
      kind: 'recharge',
      amount: walletCredit,
      balanceBefore,
      balanceAfter: balanceBefore + walletCredit,
      refId: paymentId,
      note: `Recharge (${source}) order ${orderId}`,
    });
    if (bonus > 0) {
      writeLedger(tx, {
        userId,
        kind: 'bonus',
        amount: bonus,
        balanceBefore: balanceBefore + walletCredit,
        balanceAfter,
        refId: paymentId,
        note: couponBonus > 0 ? 'Recharge + coupon bonus' : 'Recharge bonus',
      });
    }

    // Referral reward on first successful recharge (resolved in read phase).
    if (referralCredit) {
      applyReferralCredit(tx, referralCredit, { referredUserId: userId, paymentId });
    }

    // Record idempotency key.
    tx.set(dedupeRef, {
      userId,
      orderId,
      planId,
      walletCreditPaise: walletCredit,
      bonusPaise: bonus,
      newBalancePaise: balanceAfter,
      source,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Notify.
    tx.set(db.collection(Collections.notifications).doc(), {
      userId,
      title: 'Recharge successful',
      body: `₹${(walletCredit / 100).toFixed(0)} added${bonus ? ` + ₹${(bonus / 100).toFixed(0)} bonus` : ''}.`,
      type: 'recharge_success',
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      credited: true,
      alreadyProcessed: false,
      walletCreditPaise: walletCredit,
      bonusPaise: bonus,
      newBalancePaise: balanceAfter,
    };
  });
}

/** Auto-resume a customer's paused session after a successful recharge. */
export async function autoResumePausedSession(userId: string): Promise<string | null> {
  const snap = await db
    .collection(Collections.consultations)
    .where('customerId', '==', userId)
    .where('status', '==', 'paused')
    .limit(1)
    .get();
  if (snap.empty) return null;
  const ref = snap.docs[0].ref;
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists || s.data()!.status !== 'paused') return;
    const pausedAt = s.data()!.pausedAt?.toMillis?.() ?? Date.now();
    tx.update(ref, {
      status: 'active',
      pausedAccumMs: FieldValue.increment(Math.max(0, Date.now() - pausedAt)),
      pausedAt: null,
      lastTickAt: FieldValue.serverTimestamp(),
      networkStatus: 'ok',
      warnLevel: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return ref.id;
}
