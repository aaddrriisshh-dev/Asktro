/**
 * Remedy follow-up — a customer may ask ONE free clarifying question about a
 * remedy an astrologer suggested (e.g. "morning or night?"). It routes to the
 * exact astrologer who wrote that remedy (customerId + astrologerId live on the
 * doc), notifies them, and their single reply lands back on the same remedy so
 * the customer reads it in context. Beyond that one free exchange the app sends
 * the customer into a normal (paid) chat.
 *
 *  - askRemedyQuestion   (customer)   → writes the question, marks the free
 *    follow-up used, notifies the astrologer.
 *  - answerRemedyQuestion (astrologer) → writes the reply, notifies the customer.
 *
 * Notification docs are function-owned (clients cannot create them); writing one
 * triggers onNotificationCreated which delivers the push.
 */
import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { assertAuthed, assertRole, badRequest, failedPrecondition, notFound, HttpsError } from '../common/errors';

const MAX_LEN = 600;

export const askRemedyQuestion = onCall(async (req) => {
  const uid = assertAuthed(req);
  const { remedyId, question } = (req.data ?? {}) as { remedyId?: string; question?: string };
  if (!remedyId) badRequest('remedyId is required.');
  const q = (question ?? '').trim();
  if (!q) badRequest('question is required.');
  if (q.length > MAX_LEN) badRequest('Question is too long.');

  const ref = db.collection('remedies').doc(remedyId!);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) notFound('Remedy not found.');
    const r = snap.data()!;
    if (r.customerId !== uid) failedPrecondition('Not your remedy.');
    if (r.followUpUsed === true) {
      // The one free follow-up is spent — the client should open a paid chat.
      failedPrecondition('FREE_FOLLOWUP_USED');
    }

    // ALL reads before ANY write (Firestore transaction rule): the customer's
    // name for the notification body, and whether this remedy is from an AI
    // astrologer (its follow-up is answered by the portal, not a human app).
    const customerSnap = await tx.get(db.collection(Collections.users).doc(uid));
    const customerName = (customerSnap.data()?.name ?? 'A customer') as string;
    const isAiRemedy = r.isAI === true
      || (await tx.get(db.collection('astrologers').doc(String(r.astrologerId)))).data()?.isAI === true;

    tx.update(ref, {
      question: q,
      questionAt: FieldValue.serverTimestamp(),
      followUpUsed: true,
      answered: false,
      // AI remedies surface in the portal's answer queue instead of pinging a
      // (non-existent) AI-astrologer app.
      ...(isAiRemedy ? { pendingPortal: true } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Real astrologer → notify them. AI → no human app to notify; the portal
    // queue (pendingPortal) is the signal, so we skip the astrologer notification.
    if (!isAiRemedy) {
      const notifRef = db.collection(Collections.notifications).doc();
      tx.set(notifRef, {
        userId: r.astrologerId,
        title: 'Question on your remedy',
        body: `${customerName} asked about "${r.title ?? 'a remedy'}": ${q}`,
        type: 'remedy_question',
        remedyId,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });

  return { ok: true };
});

export const answerRemedyQuestion = onCall(async (req) => {
  const uid = assertRole(req, 'astrologer');
  const { remedyId, answer } = (req.data ?? {}) as { remedyId?: string; answer?: string };
  if (!remedyId) badRequest('remedyId is required.');
  const a = (answer ?? '').trim();
  if (!a) badRequest('answer is required.');
  if (a.length > MAX_LEN) badRequest('Answer is too long.');

  const ref = db.collection('remedies').doc(remedyId!);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) notFound('Remedy not found.');
    const r = snap.data()!;
    if (r.astrologerId !== uid) failedPrecondition('Not your remedy.');
    if (!r.question) failedPrecondition('There is no question to answer.');

    tx.update(ref, {
      answer: a,
      answerAt: FieldValue.serverTimestamp(),
      answered: true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Notify the customer that their astrologer replied (push + in-app bell).
    const notifRef = db.collection(Collections.notifications).doc();
    tx.set(notifRef, {
      userId: r.customerId,
      title: `${r.astrologerName ?? 'Your astrologer'} replied`,
      body: `Reply on "${r.title ?? 'your remedy'}": ${a}`,
      type: 'remedy_answer',
      remedyId,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true };
});

/**
 * Portal answer to an AI astrologer's remedy follow-up. AI remedies have no human
 * astrologer app, so a Chief Astrology admin (or super) answers on the AI's
 * behalf from the portal. Writes the reply back onto the same remedy — the
 * customer reads it exactly like a human astrologer's reply — and clears the
 * portal-pending flag. Only AI remedies with a pending question are answerable.
 */
export const answerAiRemedyQuestion = onCall(async (req) => {
  const uid = assertRole(req, 'admin');
  const role = req.auth?.token?.adminRole;
  if (role !== 'super' && role !== 'ops') {
    failedPrecondition('Requires a super or ops admin.');
  }
  const { remedyId, answer } = (req.data ?? {}) as { remedyId?: string; answer?: string };
  if (!remedyId) badRequest('remedyId is required.');
  const a = (answer ?? '').trim();
  if (!a) badRequest('answer is required.');
  if (a.length > MAX_LEN) badRequest('Answer is too long.');

  // A plain read → validate → update → notify (no transaction). Wrapped so an
  // unexpected Firestore error surfaces its REAL message instead of a bare
  // "internal" in the portal.
  try {
    const ref = db.collection('remedies').doc(remedyId!);
    const snap = await ref.get();
    if (!snap.exists) notFound('Remedy not found.');
    const r = snap.data()!;
    if (r.isAI !== true) failedPrecondition('Not an AI remedy.');
    if (!r.question) failedPrecondition('There is no question to answer.');
    if (!r.customerId || typeof r.customerId !== 'string') failedPrecondition('Remedy has no customer on it.');

    await ref.update({
      answer: a,
      answerAt: FieldValue.serverTimestamp(),
      answered: true,
      pendingPortal: false, // drops it out of the portal queue (query is == true)
      answeredByAdmin: uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Notify the customer — shown as a reply from the (AI) astrologer's name.
    await db.collection(Collections.notifications).add({
      userId: r.customerId,
      title: `${r.astrologerName ?? 'Your astrologer'} replied`,
      body: `Reply on "${r.title ?? 'your remedy'}": ${a}`,
      type: 'remedy_answer',
      remedyId,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { ok: true };
  } catch (e) {
    if (e instanceof HttpsError) throw e; // our own precondition/validation errors pass through
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('answerAiRemedyQuestion failed', { remedyId, error: msg });
    throw new HttpsError('internal', `answerAiRemedyQuestion: ${msg}`);
  }
});
