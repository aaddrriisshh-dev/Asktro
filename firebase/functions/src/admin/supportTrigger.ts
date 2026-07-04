/**
 * Support-ticket enrichment trigger.
 *
 * Clients (customer & astrologer apps) create a raw ticket with just
 * subject/body/customerId. This trigger stamps the fields the admin console
 * needs so nothing shows up blank:
 *   - ticketNo:  a human-readable, copyable number (ASK-TKT-000123), allocated
 *                atomically from a counter so two tickets never collide.
 *   - userName:  the raiser's name, denormalized from users/astrologers.
 *   - message:   mirrors `body` (the field the app writes) so the console —
 *                which reads `message` — always has the text.
 *   - role:      'customer' | 'astrologer' for grouping.
 *
 * Idempotent: if the ticket already carries a ticketNo (e.g. re-processed or
 * seeded), it does nothing.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';

/** Allocate the next ticket sequence atomically and format it. */
async function nextTicketNo(): Promise<string> {
  const ref = db.collection(Collections.counters).doc('supportTickets');
  const seq = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = (snap.data()?.seq as number | undefined) ?? 0;
    const next = current + 1;
    tx.set(ref, { seq: next }, { merge: true });
    return next;
  });
  return `ASK-TKT-${String(seq).padStart(6, '0')}`;
}

export const onSupportTicketCreated = onDocumentCreated('supportTickets/{id}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const t = snap.data();
  if (t.ticketNo) return; // already enriched (or seeded) — leave it alone

  const customerId: string | undefined = t.customerId ?? undefined;
  const astrologerId: string | undefined = t.astrologerId ?? undefined;
  const role: 'customer' | 'astrologer' = astrologerId ? 'astrologer' : 'customer';

  // Denormalize the raiser's name from their profile.
  let userName = '';
  try {
    if (astrologerId) {
      const a = await db.collection(Collections.astrologers).doc(astrologerId).get();
      userName = (a.data()?.name as string | undefined) ?? '';
    } else if (customerId) {
      const u = await db.collection(Collections.users).doc(customerId).get();
      userName = (u.data()?.name as string | undefined) ?? '';
    }
  } catch {
    // A missing profile is non-fatal — fall back to the id below.
  }
  if (!userName) userName = (astrologerId || customerId || 'Unknown').slice(0, 10);

  const ticketNo = await nextTicketNo();

  await snap.ref.update({
    ticketNo,
    userName,
    role,
    // Mirror the app's `body` into `message` so the admin console reads it.
    message: (t.message as string | undefined) ?? (t.body as string | undefined) ?? '',
    status: (t.status as string | undefined) ?? 'open',
    updatedAt: FieldValue.serverTimestamp(),
  });
});
