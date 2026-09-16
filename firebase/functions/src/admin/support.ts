/**
 * Support-ticket admin actions — reply, close and reopen. Every mutation writes
 * an audit-log entry and notifies the ticket owner so the app can surface it.
 * Money never moves here; these are messaging/status actions only.
 */
import { onCall } from 'firebase-functions/v2/https';
import { db, FieldValue, Timestamp } from '../common/admin';
import { Collections } from '../common/collections';
import { assertAuthed, assertRole, badRequest, failedPrecondition, notFound } from '../common/errors';

/** Notify the customer or astrologer who owns a ticket. */
async function notifyOwner(ticket: FirebaseFirestore.DocumentData, ticketId: string, title: string, body: string) {
  const uid = ticket.customerId || ticket.astrologerId;
  if (!uid) return;
  await db.collection(Collections.notifications).add({
    userId: uid,
    title,
    body: body.slice(0, 140),
    type: 'support_update',
    ticketId,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** Admin posts a reply on a ticket. Keeps the ticket open until it's closed. */
export const replySupportTicket = onCall(async (req) => {
  const actor = assertRole(req, 'admin');
  const { ticketId, text } = (req.data ?? {}) as { ticketId?: string; text?: string };
  if (!ticketId || !text || !text.trim()) badRequest('ticketId and text are required.');

  const ref = db.collection(Collections.supportTickets).doc(ticketId!);
  const snap = await ref.get();
  if (!snap.exists) notFound('Ticket not found.');

  const reply = { by: 'admin', actorUid: actor, text: text!.trim(), at: Timestamp.now() };
  await ref.update({
    thread: FieldValue.arrayUnion(reply),
    lastReplyAt: FieldValue.serverTimestamp(),
    lastReplyBy: 'admin',
    status: 'open',
    // The admin has now responded → this ticket no longer needs attention in the
    // portal alert bell (portalUnread tracks "a customer reply is waiting").
    portalUnread: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await notifyOwner(snap.data()!, ticketId!, 'Support replied to your ticket', text!.trim());
  await db.collection(Collections.auditLogs).add({
    actorUid: actor, actorRole: 'admin', action: 'support_reply',
    targetType: 'ticket', targetId: ticketId, createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

/** Admin closes a ticket. It stays visible in history. */
export const closeSupportTicket = onCall(async (req) => {
  const actor = assertRole(req, 'admin');
  const { ticketId } = (req.data ?? {}) as { ticketId?: string };
  if (!ticketId) badRequest('ticketId is required.');

  const ref = db.collection(Collections.supportTickets).doc(ticketId!);
  const snap = await ref.get();
  if (!snap.exists) notFound('Ticket not found.');

  await ref.update({
    status: 'closed', closedBy: actor,
    portalUnread: false,
    closedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  await notifyOwner(snap.data()!, ticketId!, 'Your support ticket was closed', 'If your issue persists, reply to reopen it.');
  await db.collection(Collections.auditLogs).add({
    actorUid: actor, actorRole: 'admin', action: 'support_close',
    targetType: 'ticket', targetId: ticketId, createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

/** Admin reopens a previously closed ticket. */
export const reopenSupportTicket = onCall(async (req) => {
  const actor = assertRole(req, 'admin');
  const { ticketId } = (req.data ?? {}) as { ticketId?: string };
  if (!ticketId) badRequest('ticketId is required.');

  const ref = db.collection(Collections.supportTickets).doc(ticketId!);
  const snap = await ref.get();
  if (!snap.exists) notFound('Ticket not found.');

  await ref.update({ status: 'open', reopenedBy: actor, portalUnread: false, updatedAt: FieldValue.serverTimestamp() });
  await db.collection(Collections.auditLogs).add({
    actorUid: actor, actorRole: 'admin', action: 'support_reopen',
    targetType: 'ticket', targetId: ticketId, createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

/**
 * Ticket owner (customer or astrologer) posts a reply from the app. This reopens
 * the ticket and flags it `portalUnread` so it surfaces in the admin alert bell —
 * closing the two-way loop with the admin `replySupportTicket` above. Runs with
 * admin privileges (bypasses client write rules) but only ever mutates a ticket
 * the caller actually owns.
 */
export const customerReplySupportTicket = onCall(async (req) => {
  const uid = assertAuthed(req);
  const { ticketId, text } = (req.data ?? {}) as { ticketId?: string; text?: string };
  if (!ticketId || !text || !text.trim()) badRequest('ticketId and text are required.');

  const ref = db.collection(Collections.supportTickets).doc(ticketId!);
  const snap = await ref.get();
  if (!snap.exists) notFound('Ticket not found.');
  const t = snap.data()!;
  if (uid !== t.customerId && uid !== t.astrologerId) {
    failedPrecondition('You can only reply to your own ticket.');
  }

  const by = uid === t.astrologerId ? 'astrologer' : 'customer';
  const reply = { by, actorUid: uid, text: text!.trim(), at: Timestamp.now() };
  await ref.update({
    thread: FieldValue.arrayUnion(reply),
    lastReplyAt: FieldValue.serverTimestamp(),
    lastReplyBy: by,
    status: 'open',      // a reply always reopens the ticket
    portalUnread: true,  // a customer reply is now waiting for the admin
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});
