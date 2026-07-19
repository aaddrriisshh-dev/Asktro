/**
 * Admin financial actions — every mutation writes an immutable audit log entry
 * and (for wallet moves) an immutable ledger entry. Money never moves without a
 * server-side, role-checked function.
 */
import { onCall } from 'firebase-functions/v2/https';
import { Transaction } from 'firebase-admin/firestore';
import { auth, db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { assertRole, assertAdminTier, badRequest, failedPrecondition, notFound } from '../common/errors';
import { writeLedger, writeAstrologerLedger } from '../wallet/ledger';
import { adminName } from '../common/actor';
import { assertTokenNotRevoked } from '../common/session';

/** Credit or debit a user's wallet (super admin only — money action). */
export const adjustWallet = onCall(async (req) => {
  const actor = assertRole(req, 'admin');
  if (req.auth?.token?.adminRole !== 'super') failedPrecondition('Requires a super admin.');
  await assertTokenNotRevoked(req);

  const { userId, amountPaise, reason, opId } = (req.data ?? {}) as {
    userId?: string;
    amountPaise?: number;
    reason?: string;
    opId?: string;
  };
  // Number.isFinite rejects NaN/±Infinity — which are typeof 'number' and would
  // otherwise corrupt the balance through FieldValue.increment. Also require an
  // integer paise amount.
  if (!userId || !Number.isFinite(amountPaise) || !Number.isInteger(amountPaise) || amountPaise === 0) {
    badRequest('userId and a non-zero integer amountPaise are required.');
  }

  const duplicate = await db.runTransaction(async (tx) => {
    // Idempotency: a double-submit of the SAME opId must not adjust twice.
    const opRef = opId ? db.collection(Collections.processedAdminOps).doc(opId) : null;
    if (opRef) {
      const opSnap = await tx.get(opRef);
      if (opSnap.exists) return true; // already applied — no-op
    }
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
    if (opRef) {
      tx.set(opRef, {
        op: 'adjustWallet', userId, amountPaise, actorUid: actor,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return false;
  });

  return { ok: true, alreadyProcessed: duplicate };
});

/** Approve/reject/process a payout request (super admin only — money action). */
/**
 * Payout decision transaction body — extracted so the double-issue and
 * over-pending guards are unit-testable. A payout can be processed only from
 * pending/approved (so it can never be paid twice), and never for more than the
 * astrologer's current pendingPayout.
 */
export async function applyPayoutDecision(
  tx: Transaction,
  payoutId: string,
  decision: 'approved' | 'rejected' | 'processed',
  actorUid: string,
): Promise<void> {
  const ref = db.collection(Collections.payouts).doc(payoutId);
  const snap = await tx.get(ref);
  if (!snap.exists) notFound('Payout not found.');
  const p = snap.data()!;
  if (p.status !== 'pending' && p.status !== 'approved') {
    failedPrecondition(`Cannot ${decision} a ${p.status} payout.`);
  }

  // Guard against paying out more than the astrologer has actually accrued
  // (amount is client-set at request time). pendingPayout lives in the private
  // financials subdoc (off the public directory doc). Read must precede writes.
  const finRef = db.collection(Collections.astrologers).doc(p.astrologerId).collection('private').doc('financials');
  if (decision === 'processed') {
    const finSnap = await tx.get(finRef);
    const pending = (finSnap.data()?.pendingPayout ?? 0) as number;
    if ((p.amount ?? 0) > pending) {
      failedPrecondition('PAYOUT_EXCEEDS_PENDING');
    }
  }

  tx.update(ref, {
    status: decision,
    processedBy: actorUid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // On final processing, clear the astrologer's pending payout by that amount.
  if (decision === 'processed') {
    tx.set(
      finRef,
      { pendingPayout: FieldValue.increment(-(p.amount ?? 0)), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    writeAstrologerLedger(tx, { astrologerId: p.astrologerId, kind: 'payout', amount: -(p.amount ?? 0), refId: payoutId, note: 'Payout processed' });
  }

  tx.set(db.collection(Collections.auditLogs).doc(), {
    actorUid,
    actorRole: 'admin',
    action: `payout_${decision}`,
    targetType: 'payout',
    targetId: payoutId,
    after: { amount: p.amount, astrologerId: p.astrologerId },
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const processPayout = onCall(async (req) => {
  const actor = assertRole(req, 'admin');
  if (req.auth?.token?.adminRole !== 'super') failedPrecondition('Requires a super admin.');
  await assertTokenNotRevoked(req);

  const { payoutId, decision } = (req.data ?? {}) as {
    payoutId?: string;
    decision?: 'approved' | 'rejected' | 'processed';
  };
  if (!payoutId || !decision) badRequest('payoutId and decision are required.');

  await db.runTransaction((tx) => applyPayoutDecision(tx, payoutId!, decision, actor));
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

  // Suspending/rejecting/disabling must end the astrologer's access *now* — force
  // them offline, disable the login, and revoke live tokens so an unexpired
  // session can't keep taking consultations. Reactivating clears the lockout.
  const locked = status === 'suspended' || status === 'rejected' || status === 'disabled';
  if (locked) {
    patch.onlineStatus = false;
    patch.available = false;
    try {
      await auth.updateUser(astrologerId!, { disabled: true });
      await auth.revokeRefreshTokens(astrologerId!);
    } catch { /* legacy random-id docs may have no auth user */ }
  } else if (status === 'approved') {
    try { await auth.updateUser(astrologerId!, { disabled: false }); } catch { /* no auth user */ }
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
  const actor = assertAdminTier(req, ['super', 'ops']);
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
