/**
 * endConsultation — either party (or admin) ends the session. Runs a final
 * billing tick, finalizes totals, generates a receipt, credits the astrologer's
 * net earning (gross − commission), frees the astrologer, and bumps both
 * participants' consultation counts. Idempotent: ending a completed session is
 * a no-op. See docs/BILLING_ENGINE.md.
 */
import { onCall } from 'firebase-functions/v2/https';
import { db, FieldValue, Timestamp } from '../common/admin';
import { Collections } from '../common/collections';
import { getGlobalConfig } from '../common/config';
import { assertAuthed, badRequest, failedPrecondition, notFound } from '../common/errors';
import { applyTick, TickOutcome } from './tickConsultation';
import { astrologerNetEarning } from './engine';

function receiptNumber(consultationId: string, nowMs: number): string {
  return `ASK-${nowMs.toString(36).toUpperCase()}-${consultationId.slice(0, 6).toUpperCase()}`;
}

export const endConsultation = onCall(async (req) => {
  const uid = assertAuthed(req);
  const { consultationId } = (req.data ?? {}) as { consultationId?: string };
  if (!consultationId) badRequest('consultationId is required.');

  const config = await getGlobalConfig();
  const nowMs = Timestamp.now().toMillis();
  const ref = db.collection(Collections.consultations).doc(consultationId!);

  const summary = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) notFound('Consultation not found.');
    const c = snap.data()!;

    if (uid !== c.customerId && uid !== c.astrologerId && req.auth?.token?.role !== 'admin') {
      failedPrecondition('Not a participant of this consultation.');
    }

    // Already terminal → idempotent no-op returning the stored summary.
    if (['completed', 'cancelled', 'expired'].includes(c.status)) {
      return {
        alreadyEnded: true,
        duration: c.duration,
        totalCharged: c.totalCharged,
        receiptNo: c.receiptNo,
        type: c.type,
        astrologerId: c.astrologerId,
      };
    }

    // A session ended while still `waiting` never started — the astrologer
    // declined, or the customer left before acceptance. Treat it as a
    // cancellation: free the astrologer, but don't bill, don't credit earnings,
    // and don't count it as a completed consultation for either party.
    if (c.status === 'waiting') {
      tx.update(ref, {
        status: 'cancelled',
        paymentStatus: 'settled',
        endTime: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      // Only a call held the exclusive lock; a cancelled chat never did.
      if (c.type === 'voice' || c.type === 'video') {
        tx.set(
          db.collection(Collections.astrologers).doc(c.astrologerId),
          { available: true, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      }
      return {
        alreadyEnded: false,
        cancelled: true,
        duration: 0,
        totalCharged: 0,
        astrologerNet: 0,
        receiptNo: null,
        type: c.type,
        astrologerId: c.astrologerId,
      };
    }

    // Final billing tick (only bills if still active). applyTick performs its
    // own reads BEFORE any writes; endConsultation must NOT read again after
    // this point — Firestore forbids reads after writes in a transaction. So we
    // compute the final cumulative figures from the pre-tick snapshot (`c`) plus
    // the delta the tick reports, rather than re-reading the document.
    let tick: TickOutcome | null = null;
    if (c.status === 'active') {
      tick = await applyTick(tx, consultationId!, config, nowMs);
    }

    const finalBilledSeconds = (c.billedSeconds ?? 0) + (tick?.billedSeconds ?? 0);
    const grossEarned = (c.totalCharged ?? 0) + (tick?.chargedPaise ?? 0);
    // Use the per-astrologer commission snapshotted at session start; fall back
    // to the global config for legacy sessions created before this field existed.
    const commissionPercent =
      typeof c.commissionPercent === 'number' ? c.commissionPercent : config.commissionPercent;
    const net = astrologerNetEarning(grossEarned, commissionPercent);
    const receiptNo = receiptNumber(consultationId!, nowMs);

    tx.update(ref, {
      status: 'completed',
      paymentStatus: 'settled',
      endTime: FieldValue.serverTimestamp(),
      duration: finalBilledSeconds,
      receiptNo,
      warnLevel: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Credit net earning + bump counts (both chat and call). Release the
    // exclusive lock ONLY for a call — a chat never held it.
    const astrologerRef = db.collection(Collections.astrologers).doc(c.astrologerId);
    const astrologerUpdate: Record<string, unknown> = {
      totalConsultations: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (c.type === 'voice' || c.type === 'video') {
      astrologerUpdate.available = true;
    }
    tx.set(astrologerRef, astrologerUpdate, { merge: true });
    // Earnings/pendingPayout live in private/financials, off the public doc.
    tx.set(
      astrologerRef.collection('private').doc('financials'),
      { earnings: FieldValue.increment(net), pendingPayout: FieldValue.increment(net), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    const customerRef = db.collection(Collections.users).doc(c.customerId);
    tx.set(
      customerRef,
      { totalConsultations: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    return {
      alreadyEnded: false,
      duration: finalBilledSeconds,
      totalCharged: grossEarned,
      astrologerNet: net,
      receiptNo,
      type: c.type,
      astrologerId: c.astrologerId,
    };
  });

  return summary;
});
