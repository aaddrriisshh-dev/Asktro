/**
 * Admin financial actions — every mutation writes an immutable audit log entry
 * and (for wallet moves) an immutable ledger entry. Money never moves without a
 * server-side, role-checked function.
 */
import { onCall } from 'firebase-functions/v2/https';
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { assertRole, badRequest, failedPrecondition, notFound } from '../common/errors';
import { writeLedger } from '../wallet/ledger';
import { adminName } from '../common/actor';

/** Credit or debit a user's wallet (finance/super admin). */
export const adjustWallet = onCall(async (req) => {
  const actor = assertRole(req, 'admin');
  const role = req.auth?.token?.adminRole;
  if (role !== 'super' && role !== 'finance') failedPrecondition('Requires finance or super admin.');

  const { userId, amountPaise, reason } = (req.data ?? {}) as {
    userId?: string;
    amountPaise?: number;
    reason?: string;
  };
  if (!userId || typeof amountPaise !== 'number' || amountPaise === 0) {
    badRequest('userId and a non-zero amountPaise are required.');
  }

  await db.runTransaction(async (tx) => {
    const userRef = db.collection(Collections.users).doc(userId!);
    const snap = await tx.get(userRef);
    if (!snap.exists) notFound('User not found.');
    const before = (snap.data()!.walletBalance ?? 0) + (snap.data()!.bonusBalance ?? 0);
    if (amountPaise! < 0 && (snap.data()!.walletBalance ?? 0) + amountPaise! < 0) {
      failedPrecondition('Debit would make the wallet negative.');
    }
    tx.update(userRef, {
      walletBalance: FieldValue.increment(amountPaise!),
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeLedger(tx, {
      userId: userId!,
      kind: 'adjustment',
      amount: amountPaise!,
      balanceBefore: before,
      balanceAfter: before + amountPaise!,
      note: reason ?? 'Admin adjustment',
    });
    tx.set(db.collection(Collections.auditLogs).doc(), {
      actorUid: actor,
      actorRole: 'admin',
      action: amountPaise! > 0 ? 'creditWallet' : 'debitWallet',
      targetType: 'user',
      targetId: userId,
      after: { amountPaise, reason: reason ?? null },
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true };
});

/** Approve/reject/process a payout request (finance/super admin). */
export const processPayout = onCall(async (req) => {
  const actor = assertRole(req, 'admin');
  const role = req.auth?.token?.adminRole;
  if (role !== 'super' && role !== 'finance') failedPrecondition('Requires finance or super admin.');

  const { payoutId, decision } = (req.data ?? {}) as {
    payoutId?: string;
    decision?: 'approved' | 'rejected' | 'processed';
  };
  if (!payoutId || !decision) badRequest('payoutId and decision are required.');

  await db.runTransaction(async (tx) => {
    const ref = db.collection(Collections.payouts).doc(payoutId!);
    const snap = await tx.get(ref);
    if (!snap.exists) notFound('Payout not found.');
    const p = snap.data()!;
    if (p.status !== 'pending' && p.status !== 'approved') {
      failedPrecondition(`Cannot ${decision} a ${p.status} payout.`);
    }

    tx.update(ref, {
      status: decision,
      processedBy: actor,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // On final processing, clear the astrologer's pending payout by that amount.
    if (decision === 'processed') {
      tx.set(
        db.collection(Collections.astrologers).doc(p.astrologerId),
        { pendingPayout: FieldValue.increment(-(p.amount ?? 0)), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }

    tx.set(db.collection(Collections.auditLogs).doc(), {
      actorUid: actor,
      actorRole: 'admin',
      action: `payout_${decision}`,
      targetType: 'payout',
      targetId: payoutId,
      after: { amount: p.amount, astrologerId: p.astrologerId },
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true };
});

/** Set an astrologer's approval/status. Approve/Reject are the vetting gate and
 *  are Super-admin-only; suspend/reactivate can be done by any admin. The
 *  approving admin's name is recorded so the console can show "Approved by ___". */
export const setAstrologerStatus = onCall(async (req) => {
  const actor = assertRole(req, 'admin');
  const { astrologerId, status } = (req.data ?? {}) as {
    astrologerId?: string;
    status?: 'pending' | 'approved' | 'suspended' | 'rejected' | 'disabled';
  };
  if (!astrologerId || !status) badRequest('astrologerId and status are required.');

  const isSuper = req.auth?.token?.adminRole === 'super';
  if ((status === 'approved' || status === 'rejected') && !isSuper) {
    failedPrecondition('Only a Super Admin can approve or reject an astrologer.');
  }

  const patch: Record<string, unknown> = { accountStatus: status, updatedAt: FieldValue.serverTimestamp() };
  if (status === 'approved') {
    const nm = await adminName(actor);
    patch.verified = true;
    patch.approvedBy = actor;
    patch.approvedByName = nm;
    patch.approvedAt = FieldValue.serverTimestamp();
  }

  await db.collection(Collections.astrologers).doc(astrologerId!).set(patch, { merge: true });
  await db.collection(Collections.auditLogs).add({
    actorUid: actor,
    actorRole: 'admin',
    actorName: await adminName(actor),
    action: `astrologer_${status}`,
    targetType: 'astrologer',
    targetId: astrologerId,
    after: { status },
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

/** Suspend, reactivate or soft-delete a customer (ops/super admin). */
export const setUserStatus = onCall(async (req) => {
  const actor = assertRole(req, 'admin');
  const { userId, status } = (req.data ?? {}) as {
    userId?: string;
    status?: 'active' | 'blocked' | 'deleted';
  };
  if (!userId || !status) badRequest('userId and status are required.');

  const ref = db.collection(Collections.users).doc(userId!);
  const snap = await ref.get();
  if (!snap.exists) notFound('User not found.');

  await ref.set(
    { accountStatus: status, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  await db.collection(Collections.auditLogs).add({
    actorUid: actor,
    actorRole: 'admin',
    action: `user_${status}`,
    targetType: 'user',
    targetId: userId,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});
