/**
 * activateConsultation — called when the astrologer accepts and the channel is
 * connected. Transitions waiting → active and stamps the server start time.
 * Only the astrologer party (or admin) may activate.
 */
import { onCall } from 'firebase-functions/v2/https';
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { assertAuthed, badRequest, failedPrecondition, notFound } from '../common/errors';

export const activateConsultation = onCall(async (req) => {
  const uid = assertAuthed(req);
  const { consultationId } = (req.data ?? {}) as { consultationId?: string };
  if (!consultationId) badRequest('consultationId is required.');

  const ref = db.collection(Collections.consultations).doc(consultationId!);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) notFound('Consultation not found.');
    const c = snap.data()!;

    const isParticipant = uid === c.astrologerId || uid === c.customerId;
    if (!isParticipant && req.auth?.token?.role !== 'admin') {
      failedPrecondition('Not a participant of this consultation.');
    }
    if (c.status !== 'waiting') {
      failedPrecondition(`Cannot activate a ${c.status} consultation.`);
    }

    tx.update(ref, {
      status: 'active',
      startTime: FieldValue.serverTimestamp(),
      lastTickAt: FieldValue.serverTimestamp(),
      paymentStatus: 'pending',
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true };
});
