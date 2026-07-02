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
import { applyTick } from './tickConsultation';
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

    // Final billing tick (only bills if still active).
    if (c.status === 'active') {
      await applyTick(tx, consultationId!, config, nowMs);
    }

    // Re-read post-tick figures.
    const finalSnap = await tx.get(ref);
    const fc = finalSnap.data()!;

    const grossEarned = fc.totalCharged ?? 0;
    const net = astrologerNetEarning(grossEarned, config.commissionPercent);
    const receiptNo = receiptNumber(consultationId!, nowMs);

    tx.update(ref, {
      status: 'completed',
      paymentStatus: 'settled',
      endTime: FieldValue.serverTimestamp(),
      duration: fc.billedSeconds ?? 0,
      receiptNo,
      warnLevel: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Free the astrologer, credit net earning, bump counts.
    const astrologerRef = db.collection(Collections.astrologers).doc(fc.astrologerId);
    tx.set(
      astrologerRef,
      {
        available: true,
        earnings: FieldValue.increment(net),
        pendingPayout: FieldValue.increment(net),
        totalConsultations: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const customerRef = db.collection(Collections.users).doc(fc.customerId);
    tx.set(
      customerRef,
      { totalConsultations: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    return {
      alreadyEnded: false,
      duration: fc.billedSeconds ?? 0,
      totalCharged: grossEarned,
      astrologerNet: net,
      receiptNo,
      type: fc.type,
      astrologerId: fc.astrologerId,
    };
  });

  return summary;
});
