/**
 * pauseConsultation / resumeConsultation — used on wallet exhaustion, network
 * loss, or astrologer unavailability, and on recharge/reconnect. Paused time is
 * accumulated so it is never billed. Same sessionId throughout — chat history
 * and Agora channel are preserved. See docs/BILLING_ENGINE.md.
 */
import { onCall } from 'firebase-functions/v2/https';
import { db, FieldValue, Timestamp } from '../common/admin';
import { Collections } from '../common/collections';
import { assertAuthed, badRequest, failedPrecondition, notFound } from '../common/errors';

async function participantGuard(tx: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, uid: string, role?: string) {
  const snap = await tx.get(ref);
  if (!snap.exists) notFound('Consultation not found.');
  const c = snap.data()!;
  if (uid !== c.customerId && uid !== c.astrologerId && role !== 'admin') {
    failedPrecondition('Not a participant of this consultation.');
  }
  return c;
}

export const pauseConsultation = onCall(async (req) => {
  const uid = assertAuthed(req);
  const { consultationId, reason } = (req.data ?? {}) as {
    consultationId?: string;
    reason?: string;
  };
  if (!consultationId) badRequest('consultationId is required.');
  const ref = db.collection(Collections.consultations).doc(consultationId!);

  await db.runTransaction(async (tx) => {
    const c = await participantGuard(tx, ref, uid, req.auth?.token?.role);
    if (c.status !== 'active') failedPrecondition(`Cannot pause a ${c.status} consultation.`);
    tx.update(ref, {
      status: 'paused',
      pausedAt: FieldValue.serverTimestamp(),
      networkStatus: reason === 'network' ? 'reconnecting' : c.networkStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true };
});

export const resumeConsultation = onCall(async (req) => {
  const uid = assertAuthed(req);
  const { consultationId } = (req.data ?? {}) as { consultationId?: string };
  if (!consultationId) badRequest('consultationId is required.');
  const ref = db.collection(Collections.consultations).doc(consultationId!);

  const result = await db.runTransaction(async (tx) => {
    const c = await participantGuard(tx, ref, uid, req.auth?.token?.role);
    if (c.status !== 'paused') failedPrecondition(`Cannot resume a ${c.status} consultation.`);

    // Verify the customer actually has balance to continue.
    const userSnap = await tx.get(db.collection(Collections.users).doc(c.customerId));
    const user = userSnap.data() ?? {};
    const spendable = (user.walletBalance ?? 0) + (user.bonusBalance ?? 0);
    if (spendable <= 0) {
      failedPrecondition('INSUFFICIENT_BALANCE');
    }

    const pausedAtMs = (c.pausedAt as Timestamp | null)?.toMillis() ?? Timestamp.now().toMillis();
    const pausedSpanMs = Math.max(0, Timestamp.now().toMillis() - pausedAtMs);

    tx.update(ref, {
      status: 'active',
      pausedAccumMs: FieldValue.increment(pausedSpanMs),
      pausedAt: null,
      lastTickAt: FieldValue.serverTimestamp(),
      networkStatus: 'ok',
      warnLevel: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { spendable };
  });
  return { ok: true, ...result };
});
