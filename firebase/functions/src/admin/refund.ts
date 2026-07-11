/**
 * refundConsultation — finance/super admin refunds a (fully or partially)
 * charged consultation. Unlike a bare `adjustWallet` credit, this ALSO claws
 * back the astrologer's already-credited net earning for the refunded amount,
 * so a refund never leaves the platform paying an astrologer for money the
 * customer got back. Idempotent per-amount via `refundedPaise` on the session.
 */
import { onCall } from 'firebase-functions/v2/https';
import { Transaction } from 'firebase-admin/firestore';
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { assertRole, badRequest, failedPrecondition, notFound } from '../common/errors';
import { writeLedger, writeAstrologerLedger } from '../wallet/ledger';
import { astrologerNetEarning } from '../billing/engine';
import { getGlobalConfig } from '../common/config';
import { GlobalConfig } from '../common/types';

/**
 * Refund transaction body — extracted so the money movement is unit-testable.
 * Refunds the customer to the SAME buckets the charge was funded from (real
 * wallet vs non-withdrawable bonus/grace — P3-7), and reverses the astrologer's
 * accrual, keeping the astrologerLedger reconciled with pendingPayout (P3-8).
 */
export interface RefundResult {
  refundAmt: number;
  walletRefund: number;
  bonusRefund: number;
  netClawedBack: number;
  shortfall: number;
  alreadyProcessed?: boolean;
}

export async function applyRefund(
  tx: Transaction,
  consultationId: string,
  input: { amountPaise?: number; reason?: string; actorUid: string; opId?: string },
  config: GlobalConfig,
): Promise<RefundResult> {
  // Idempotency: a double-submit (double-click / client retry) must not refund
  // twice. Keyed by a client-supplied opId in processedAdminOps, checked in the
  // read phase and stamped in the write phase — same pattern as recharge credit.
  const opRef = input.opId
    ? db.collection(Collections.processedAdminOps).doc(input.opId)
    : null;
  if (opRef) {
    const opSnap = await tx.get(opRef);
    if (opSnap.exists) {
      const prev = (opSnap.data()!.result ?? {}) as RefundResult;
      return { ...prev, alreadyProcessed: true };
    }
  }

  const ref = db.collection(Collections.consultations).doc(consultationId);
  const snap = await tx.get(ref);
  if (!snap.exists) notFound('Consultation not found.');
  const c = snap.data()!;
  if (!['completed', 'expired', 'cancelled'].includes(c.status)) {
    failedPrecondition('Only a finished consultation can be refunded.');
  }

  const gross = (c.totalCharged ?? 0) as number;
  const already = (c.refundedPaise ?? 0) as number;
  const refundable = Math.max(0, gross - already);
  if (refundable <= 0) failedPrecondition('Nothing left to refund on this consultation.');
  const refundAmt = Math.min(input.amountPaise ?? refundable, refundable);
  if (refundAmt <= 0) failedPrecondition('Refund amount resolves to zero.');

  const userRef = db.collection(Collections.users).doc(c.customerId);
  const finRef = db.collection(Collections.astrologers).doc(c.astrologerId).collection('private').doc('financials');
  const [userSnap, finSnap] = await Promise.all([tx.get(userRef), tx.get(finRef)]);
  if (!userSnap.exists) notFound('Customer not found.');
  const walletBefore = (userSnap.data()!.walletBalance ?? 0) + (userSnap.data()!.bonusBalance ?? 0);

  // P3-7: allocate the refund to wallet vs bonus in the SAME proportion the
  // charge was funded. A session paid entirely from bonus refunds entirely to
  // bonus (non-withdrawable) — never to real cash. Legacy sessions without the
  // split recorded fall back to all-wallet (the historical behaviour).
  const grossWallet = typeof c.chargedFromWallet === 'number' ? c.chargedFromWallet : gross;
  const walletRefund = gross > 0 ? Math.min(refundAmt, Math.round((refundAmt * grossWallet) / gross)) : refundAmt;
  const bonusRefund = refundAmt - walletRefund;

  // Astrologer clawback = net share (after commission) of the refunded amount,
  // clamped so neither counter goes negative. If a payout already cleared the
  // pendingPayout, we reclaim what remains and flag the shortfall.
  const commissionPercent =
    typeof c.commissionPercent === 'number' ? c.commissionPercent : config.commissionPercent;
  const netShare = astrologerNetEarning(refundAmt, commissionPercent);
  const earnings0 = (finSnap.data()?.earnings ?? 0) as number;
  const pending0 = (finSnap.data()?.pendingPayout ?? 0) as number;
  const clawEarnings = Math.min(netShare, Math.max(0, earnings0));
  const clawPending = Math.min(netShare, Math.max(0, pending0));
  const shortfall = netShare - clawPending; // already paid out — cannot reclaim from pending

  // ---- WRITES ----
  tx.update(userRef, {
    walletBalance: FieldValue.increment(walletRefund),
    bonusBalance: FieldValue.increment(bonusRefund),
    updatedAt: FieldValue.serverTimestamp(),
  });
  writeLedger(tx, {
    userId: c.customerId,
    kind: 'refund',
    amount: refundAmt,
    balanceBefore: walletBefore,
    balanceAfter: walletBefore + refundAmt,
    refId: consultationId,
    note: input.reason ?? 'Consultation refund',
  });

  if (clawEarnings > 0 || clawPending > 0) {
    tx.set(
      finRef,
      {
        earnings: FieldValue.increment(-clawEarnings),
        pendingPayout: FieldValue.increment(-clawPending),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    // P3-8: the astrologerLedger is a pending-payout trail, so the reversal must
    // record the amount actually removed from pendingPayout (-clawPending), NOT
    // -clawEarnings. Otherwise a refund after a cleared payout desyncs the ledger
    // sum from pendingPayout by the shortfall. The already-paid part is handled
    // by the shortfall alert below, not a phantom ledger movement.
    if (clawPending > 0) {
      writeAstrologerLedger(tx, { astrologerId: c.astrologerId, kind: 'refund_reversal', amount: -clawPending, refId: consultationId, note: input.reason ?? 'Refund clawback' });
    }
  }

  tx.update(ref, {
    refundedPaise: FieldValue.increment(refundAmt),
    paymentStatus: refundAmt >= refundable ? 'refunded' : c.paymentStatus,
    lastRefundAt: FieldValue.serverTimestamp(),
    lastRefundReason: input.reason ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  tx.set(db.collection(Collections.auditLogs).doc(), {
    actorUid: input.actorUid,
    actorRole: 'admin',
    action: 'refundConsultation',
    targetType: 'consultation',
    targetId: consultationId,
    after: { refundAmt, walletRefund, bonusRefund, netShare, clawEarnings, clawPending, shortfall, reason: input.reason ?? null },
    createdAt: FieldValue.serverTimestamp(),
  });

  if (shortfall > 0) {
    tx.set(db.collection('alerts').doc(), {
      kind: 'refund_clawback_shortfall',
      severity: 'warning',
      message: `Refund on ${consultationId}: ₹${(shortfall / 100).toFixed(2)} of astrologer ${c.astrologerId}'s net was already paid out and could not be reclaimed automatically.`,
      refId: consultationId,
      resolved: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  const result: RefundResult = { refundAmt, walletRefund, bonusRefund, netClawedBack: clawPending, shortfall };

  // Stamp the idempotency marker so a retry of the SAME opId is a no-op that
  // returns this result instead of refunding again.
  if (opRef) {
    tx.set(opRef, {
      op: 'refund',
      consultationId,
      actorUid: input.actorUid,
      result,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  return result;
}

export const refundConsultation = onCall(async (req) => {
  const actor = assertRole(req, 'admin');
  if (req.auth?.token?.adminRole !== 'super') failedPrecondition('Requires a super admin.');

  const { consultationId, amountPaise, reason, opId } = (req.data ?? {}) as {
    consultationId?: string;
    amountPaise?: number;
    opId?: string;
    reason?: string;
  };
  if (!consultationId) badRequest('consultationId is required.');
  if (amountPaise !== undefined && (typeof amountPaise !== 'number' || amountPaise <= 0)) {
    badRequest('amountPaise, if given, must be a positive number.');
  }

  const config = await getGlobalConfig();
  const result = await db.runTransaction((tx) =>
    applyRefund(tx, consultationId!, { amountPaise, reason, actorUid: actor, opId }, config),
  );
  return { ok: true, ...result };
});
