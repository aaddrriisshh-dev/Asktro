/**
 * Developer/testing helpers — a "dummy payment gateway".
 *
 * devSimulateRecharge credits a user's wallet through the SAME immutable ledger
 * a real Razorpay success would, stamping a live server timestamp. This lets the
 * dashboard (Revenue, Paid Users, First-Recharge Conversion) be exercised with
 * genuine events instead of random seed data. Admin-only.
 */
import { onCall } from 'firebase-functions/v2/https';
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { assertRole, assertAuthed, badRequest, notFound, failedPrecondition } from '../common/errors';
import { writeLedger } from '../wallet/ledger';
import { creditRecharge, autoResumePausedSession } from '../wallet/creditRecharge';

export const devSimulateRecharge = onCall(async (req) => {
  const actor = assertRole(req, 'admin');

  // Hard kill-switch for production. This mints wallet credit with no real
  // payment, so it must be INERT unless test payments are explicitly enabled
  // (config/global.devPaymentsEnabled === true, a Super-Admin-only write). In
  // production this flag is off/absent, so even a compromised admin token can
  // never print money here.
  const cfg = await db.collection('config').doc('global').get();
  if (cfg.data()?.devPaymentsEnabled !== true) {
    failedPrecondition('Test payments are disabled. Enable config/global.devPaymentsEnabled to use this.');
  }

  const { userId, amountPaise, bonusPaise } = (req.data ?? {}) as {
    userId?: string; amountPaise?: number; bonusPaise?: number;
  };
  if (!userId || typeof amountPaise !== 'number' || amountPaise <= 0) {
    badRequest('userId and a positive amountPaise are required.');
  }
  const bonus = typeof bonusPaise === 'number' && bonusPaise > 0 ? bonusPaise : 0;

  const result = await db.runTransaction(async (tx) => {
    const userRef = db.collection(Collections.users).doc(userId!);
    const snap = await tx.get(userRef);
    if (!snap.exists) notFound('User not found.');
    const u = snap.data()!;
    const before = (u.walletBalance ?? 0) + (u.bonusBalance ?? 0);
    const isFirst = (u.totalRecharge ?? 0) === 0;

    tx.update(userRef, {
      walletBalance: FieldValue.increment(amountPaise!),
      bonusBalance: FieldValue.increment(bonus),
      totalRecharge: FieldValue.increment(amountPaise!),
      ...(isFirst ? { firstRechargeAt: FieldValue.serverTimestamp() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    writeLedger(tx, {
      userId: userId!, kind: 'recharge', amount: amountPaise!,
      balanceBefore: before, balanceAfter: before + amountPaise!,
      refId: `dev_${Date.now()}`, note: 'Test recharge (dummy gateway)',
    });
    if (bonus > 0) {
      writeLedger(tx, {
        userId: userId!, kind: 'bonus', amount: bonus,
        balanceBefore: before + amountPaise!, balanceAfter: before + amountPaise! + bonus,
        note: 'Test bonus (dummy gateway)',
      });
    }
    return { newBalancePaise: before + amountPaise! + bonus, isFirstRecharge: isFirst };
  });

  await db.collection(Collections.auditLogs).add({
    actorUid: actor, actorRole: 'admin', action: 'devSimulateRecharge',
    targetType: 'user', targetId: userId, after: { amountPaise, bonusPaise: bonus },
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, ...result };
});

/**
 * simulateRechargeSelf — a "dummy gateway" for the SIGNED-IN user to recharge a
 * plan without Razorpay, running the SAME creditRecharge logic (plan bonus,
 * ledger, notification) a real payment would. For pre-launch testing only:
 * gated behind config/global.devPaymentsEnabled so it is inert in production.
 */
export const simulateRechargeSelf = onCall(async (req) => {
  const userId = assertAuthed(req);
  const { planId, couponId } = (req.data ?? {}) as { planId?: string; couponId?: string };
  if (!planId) badRequest('planId is required.');

  const cfg = await db.collection('config').doc('global').get();
  if (cfg.data()?.devPaymentsEnabled !== true) {
    failedPrecondition('Test payments are disabled. Enable config/global.devPaymentsEnabled to use this.');
  }

  const ref = `dev_${userId.slice(0, 6)}_${Date.now()}`;
  const result = await creditRecharge({
    userId, paymentId: ref, orderId: ref, planId: planId!,
    couponId: couponId || null, source: 'callable',
  });
  const resumedConsultationId = await autoResumePausedSession(userId);
  return { ...result, resumedConsultationId };
});
