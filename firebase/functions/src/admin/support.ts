/**
 * Support-ticket admin actions — reply, close and reopen. Every mutation writes
 * an audit-log entry and notifies the ticket owner so the app can surface it.
 * Money never moves here; these are messaging/status actions only.
 */
import { onCall } from 'firebase-functions/v2/https';
import { db, FieldValue, Timestamp } from '../common/admin';
import { Collections } from '../common/collections';
import { assertRole, badRequest, notFound } from '../common/errors';

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

  await ref.update({ status: 'open', reopenedBy: actor, updatedAt: FieldValue.serverTimestamp() });
  await db.collection(Collections.auditLogs).add({
    actorUid: actor, actorRole: 'admin', action: 'support_reopen',
    targetType: 'ticket', targetId: ticketId, createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});
