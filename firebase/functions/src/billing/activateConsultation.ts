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

    // A human consultation may only be activated by the astrologer (the Accept
    // handshake) or an admin. The customer may self-activate ONLY an AI persona,
    // which has no human on the other side to accept. Letting the customer
    // activate a human session would flip it out of the astrologer's request
    // queue before they ever see it.
    const astroSnap = await tx.get(db.collection(Collections.astrologers).doc(c.astrologerId));
    const isAI = astroSnap.data()?.isAI === true;
    const isAstrologer = uid === c.astrologerId;
    const isAdmin = req.auth?.token?.role === 'admin';
    const isAiCustomer = uid === c.customerId && isAI;
    if (!isAstrologer && !isAdmin && !isAiCustomer) {
      failedPrecondition('Only the astrologer can accept this consultation.');
    }
    // Idempotent: reopening an already-active session is a no-op, not an error
    // (previously this threw "Cannot activate an active consultation").
    if (c.status === 'active') return;
    if (c.status !== 'waiting') {
      failedPrecondition(`Cannot activate a ${c.status} consultation.`);
    }

    tx.update(ref, {
      status: 'active',
      startTime: FieldValue.serverTimestamp(),
      lastTickAt: FieldValue.serverTimestamp(),
      // Seed the customer-presence marker so the billing frontier (which never
      // bills past the customer's last confirmed heartbeat + a short settle
      // window) starts from the session's own start, not the epoch.
      customerLastTickAt: FieldValue.serverTimestamp(),
      // For a HUMAN session, also seed the astrologer-presence marker: they just
      // accepted, so their presence is confirmed at start, and the frontier
      // should gate on BOTH parties from the first tick (mirrors resume). AI
      // sessions must NOT seed this — no human ever ticks, so a frozen marker
      // would freeze the frontier and stall billing.
      ...(!isAI ? { astrologerLastTickAt: FieldValue.serverTimestamp() } : {}),
      paymentStatus: 'pending',
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true };
});
