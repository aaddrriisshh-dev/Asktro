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
import { assertRole, badRequest, notFound } from '../common/errors';
import { writeLedger } from '../wallet/ledger';

export const devSimulateRecharge = onCall(async (req) => {
  const actor = assertRole(req, 'admin');
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
