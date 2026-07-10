/**
 * refundConsultation — finance/super admin refunds a (fully or partially)
 * charged consultation. Unlike a bare `adjustWallet` credit, this ALSO claws
 * back the astrologer's already-credited net earning for the refunded amount,
 * so a refund never leaves the platform paying an astrologer for money the
 * customer got back. Idempotent per-amount via `refundedPaise` on the session.
 */
import { onCall } from 'firebase-functions/v2/https';
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { assertRole, badRequest, failedPrecondition, notFound } from '../common/errors';
import { writeLedger, writeAstrologerLedger } from '../wallet/ledger';
import { astrologerNetEarning } from '../billing/engine';
import { getGlobalConfig } from '../common/config';

export const refundConsultation = onCall(async (req) => {
  const actor = assertRole(req, 'admin');
  if (req.auth?.token?.adminRole !== 'super') failedPrecondition('Requires a super admin.');

  const { consultationId, amountPaise, reason } = (req.data ?? {}) as {
    consultationId?: string;
    amountPaise?: number;
    reason?: string;
  };
  if (!consultationId) badRequest('consultationId is required.');
  if (amountPaise !== undefined && (typeof amountPaise !== 'number' || amountPaise <= 0)) {
    badRequest('amountPaise, if given, must be a positive number.');
  }

  const config = await getGlobalConfig();
  const ref = db.collection(Collections.consultations).doc(consultationId!);

  const result = await db.runTransaction(async (tx) => {
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
    const refundAmt = Math.min(amountPaise ?? refundable, refundable);
    if (refundAmt <= 0) failedPrecondition('Refund amount resolves to zero.');

    // Read the two accounts BEFORE any write (Firestore read-before-write rule).
    // Astrologer money lives in private/financials, off the public doc.
    const userRef = db.collection(Collections.users).doc(c.customerId);
    const finRef = db.collection(Collections.astrologers).doc(c.astrologerId).collection('private').doc('financials');
    const [userSnap, finSnap] = await Promise.all([tx.get(userRef), tx.get(finRef)]);
    if (!userSnap.exists) notFound('Customer not found.');
    const walletBefore = (userSnap.data()!.walletBalance ?? 0) + (userSnap.data()!.bonusBalance ?? 0);

    // Astrologer clawback = the net share (after commission) of the refunded
    // amount, clamped so neither counter goes negative. If a payout already
    // cleared the pendingPayout, we claw back what remains and flag the shortfall.
    const commissionPercent =
      typeof c.commissionPercent === 'number' ? c.commissionPercent : config.commissionPercent;
    const netShare = astrologerNetEarning(refundAmt, commissionPercent);
    const earnings0 = (finSnap.data()?.earnings ?? 0) as number;
    const pending0 = (finSnap.data()?.pendingPayout ?? 0) as number;
    const clawEarnings = Math.min(netShare, Math.max(0, earnings0));
    const clawPending = Math.min(netShare, Math.max(0, pending0));
    const shortfall = netShare - clawPending; // already paid out — cannot reclaim from pending

    // ---- WRITES ----
    // Refund to the customer's real wallet.
    tx.update(userRef, {
      walletBalance: FieldValue.increment(refundAmt),
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeLedger(tx, {
      userId: c.customerId,
      kind: 'refund',
      amount: refundAmt,
      balanceBefore: walletBefore,
      balanceAfter: walletBefore + refundAmt,
      refId: consultationId,
      note: reason ?? 'Consultation refund',
    });

    // Reverse the astrologer's accrual for the refunded slice (private/financials).
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
      writeAstrologerLedger(tx, { astrologerId: c.astrologerId, kind: 'refund_reversal', amount: -clawEarnings, refId: consultationId!, note: reason ?? 'Refund clawback' });
    }

    tx.update(ref, {
      refundedPaise: FieldValue.increment(refundAmt),
      paymentStatus: refundAmt >= refundable ? 'refunded' : c.paymentStatus,
      lastRefundAt: FieldValue.serverTimestamp(),
      lastRefundReason: reason ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(db.collection(Collections.auditLogs).doc(), {
      actorUid: actor,
      actorRole: 'admin',
      action: 'refundConsultation',
      targetType: 'consultation',
      targetId: consultationId,
      after: { refundAmt, netShare, clawEarnings, clawPending, shortfall, reason: reason ?? null },
      createdAt: FieldValue.serverTimestamp(),
    });

    // If we could not fully claw back (payout already cleared), raise an alert so
    // finance can net it off the astrologer's next payout manually.
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

    return { refundAmt, netClawedBack: clawPending, shortfall };
  });

  return { ok: true, ...result };
});
