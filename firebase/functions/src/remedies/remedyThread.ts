/**
 * Remedy nurture thread — a free, ongoing 1-on-1 conversation between an AI
 * astrologer (operated by super/ops admins from the portal) and the customer,
 * anchored on a remedy. It turns the one-shot remedy answer into a relationship
 * channel that also drives soft upsell (a message may carry a product "hook"
 * deep-linking into the store).
 *
 *  - sendRemedyThreadMessage (super/ops admin) → posts an astrologer message
 *    (optionally with a product hook) + notifies the customer.
 *  - replyToRemedyThread     (customer)        → posts a customer reply + flags
 *    the thread for portal attention.
 *  - setRemedyMessagesOptOut (customer)        → the compliance opt-out; when on,
 *    admins can't send proactive messages to that user.
 *
 * Messages live at remedies/{remedyId}/thread/{msgId}. The store deep-link the
 * hook points to is /store/product/<productId> in the customer app.
 */
import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { assertAuthed, assertRole, badRequest, failedPrecondition, notFound, HttpsError } from '../common/errors';

const MAX_LEN = 600;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** A product hook attached to an astrologer message → deep-links into the store. */
interface ProductHook { kind: 'product'; productId: string; title: string; cta: string }
function coerceHook(v: unknown): ProductHook | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (o.kind !== 'product') return undefined; // puja hooks are "coming soon" — not sendable yet
  const productId = str(o.productId);
  if (!productId) return undefined;
  return { kind: 'product', productId, title: str(o.title) ?? 'Product', cta: str(o.cta) ?? 'View in store' };
}

/** Admin (super/ops) posts a message to the customer on a remedy thread. */
export const sendRemedyThreadMessage = onCall(async (req) => {
  const uid = assertRole(req, 'admin');
  const role = req.auth?.token?.adminRole;
  if (role !== 'super' && role !== 'ops') failedPrecondition('Requires a super or ops admin.');
  const { remedyId, text, hook } = (req.data ?? {}) as { remedyId?: string; text?: string; hook?: unknown };
  if (!remedyId) badRequest('remedyId is required.');
  const t = (text ?? '').trim();
  if (!t) badRequest('A message is required.');
  if (t.length > MAX_LEN) badRequest('Message is too long.');
  const cleanHook = coerceHook(hook);

  try {
    const ref = db.collection('remedies').doc(remedyId!);
    const snap = await ref.get();
    if (!snap.exists) notFound('Remedy not found.');
    const r = snap.data()!;
    if (!r.customerId || typeof r.customerId !== 'string') failedPrecondition('Remedy has no customer on it.');

    // Compliance: respect the user's opt-out of proactive astrologer messages.
    const userSnap = await db.collection(Collections.users).doc(r.customerId).get();
    if (userSnap.data()?.remedyMessagesOptOut === true) {
      failedPrecondition('This user has turned off astrologer messages.');
    }

    await ref.collection('thread').add({
      senderRole: 'astrologer',
      text: t,
      ...(cleanHook ? { hook: cleanHook } : {}),
      sentByAdmin: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    await ref.update({
      threadLastAt: FieldValue.serverTimestamp(),
      threadUnreadForPortal: false, // admin has now responded
      pendingPortal: false, // it's out of the pending-answer queue
      answered: true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection(Collections.notifications).add({
      userId: r.customerId,
      title: `${r.astrologerName ?? 'Your astrologer'} sent you a message`,
      body: t.slice(0, 140),
      type: 'remedy_message',
      remedyId,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('sendRemedyThreadMessage failed', { remedyId, error: msg });
    throw new HttpsError('internal', `sendRemedyThreadMessage: ${msg}`);
  }
});

/** Customer replies on a remedy thread. Flags it for the portal to answer. */
export const replyToRemedyThread = onCall(async (req) => {
  const uid = assertAuthed(req);
  const { remedyId, text } = (req.data ?? {}) as { remedyId?: string; text?: string };
  if (!remedyId) badRequest('remedyId is required.');
  const t = (text ?? '').trim();
  if (!t) badRequest('A message is required.');
  if (t.length > MAX_LEN) badRequest('Message is too long.');

  try {
    const ref = db.collection('remedies').doc(remedyId!);
    const snap = await ref.get();
    if (!snap.exists) notFound('Remedy not found.');
    const r = snap.data()!;
    if (r.customerId !== uid) failedPrecondition('Not your remedy.');

    await ref.collection('thread').add({
      senderRole: 'customer',
      text: t,
      createdAt: FieldValue.serverTimestamp(),
    });
    await ref.update({
      threadLastAt: FieldValue.serverTimestamp(),
      threadUnreadForPortal: true, // a customer reply is waiting for the admin
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('replyToRemedyThread failed', { remedyId, error: msg });
    throw new HttpsError('internal', `replyToRemedyThread: ${msg}`);
  }
});

/** Customer toggles whether astrologers may proactively message them (opt-out). */
export const setRemedyMessagesOptOut = onCall(async (req) => {
  const uid = assertAuthed(req);
  const optOut = (req.data ?? {} as { optOut?: unknown }).optOut === true;
  await db.collection(Collections.users).doc(uid).set(
    { remedyMessagesOptOut: optOut, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return { ok: true };
});
