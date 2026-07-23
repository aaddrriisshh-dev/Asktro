/**
 * onChatMessageNudge — retention nudge + unread bookkeeping for chats.
 *
 * Fires on every new message in a consultation. It does two jobs:
 *
 *  1. DENORMALIZE onto the consultation doc — `lastMessageText`, `lastMessageAt`
 *     and a running `customerUnread` count — so the home "Continue reading" card
 *     shows an accurate unread badge + preview WITHOUT opening a live listener on
 *     each chat's messages (this is also the N+1 fix the perf audit called out).
 *
 *  2. NUDGE the customer when an astrologer/AI message arrives AND the customer
 *     has navigated away from the chat (their heartbeat `customerLastTickAt` has
 *     gone stale). A coalesced push ("3 new messages from …") is sent, throttled
 *     to one per minute and capped so it never nags: a first nudge plus at most
 *     one reminder, then silence until they reopen the chat (which resets the
 *     counters, client-side).
 *
 * MONEY-SAFE: this function only reads state and writes a notification doc — it
 * never touches billing. The nudge deep-links to the chat, where the existing
 * resume/grace screen governs any charge; tapping a nudge cannot start the meter.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, FieldValue, Timestamp } from '../common/admin';

// No customer heartbeat for this long ⇒ they've left the chat screen.
const AWAY_MS = 25_000;
// At most one push per chat per minute (the badge count carries the rest).
const NUDGE_THROTTLE_MS = 60_000;
// First nudge + one reminder, then stop until the chat is reopened.
const MAX_NUDGES = 2;

/** Short one-line preview for the home card + push body. */
function previewOf(m: Record<string, unknown>): string {
  if ((m.type as string) === 'remedy') {
    const t = (m.title as string) || 'A remedy for you';
    return t.slice(0, 90);
  }
  if ((m.imageUrl as string) || (m.image as string)) {
    const t = (m.text as string) || '';
    return t.trim() ? t.slice(0, 90) : '📷 Photo';
  }
  return ((m.text as string) || '').replace(/\s+/g, ' ').trim().slice(0, 90);
}

/** Astrologer display name + photo, read once per nudge (throttled, so cheap). */
async function astrologerBrief(astrologerId: string | undefined): Promise<{ name: string; photo: string | null }> {
  if (!astrologerId) return { name: 'Your astrologer', photo: null };
  const snap = await db.collection('astrologers').doc(astrologerId).get().catch(() => null);
  const d = snap?.data() ?? {};
  return {
    name: (d.name as string) || 'Your astrologer',
    photo: (d.profilePhoto as string) || null,
  };
}

export const onChatMessageNudge = onDocumentCreated(
  'consultations/{consultationId}/messages/{messageId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const m = snap.data() as Record<string, unknown>;
    const consultationId = event.params.consultationId;

    const senderId = m.senderId as string | undefined;
    if (!senderId || senderId === 'system') return; // ignore system/scaffolding bubbles

    const cRef = db.collection('consultations').doc(consultationId);
    const cSnap = await cRef.get();
    if (!cSnap.exists) return;
    const c = cSnap.data() as Record<string, unknown>;
    const customerId = c.customerId as string | undefined;
    if (!customerId) return;

    const preview = previewOf(m);

    // The customer's OWN message ⇒ they're present and reading. Refresh the
    // preview, clear the unread badge, and re-arm nudges for the next time they
    // step away.
    if (senderId === customerId) {
      await cRef
        .set(
          {
            lastMessageText: preview,
            lastMessageAt: FieldValue.serverTimestamp(),
            lastMessageFromCustomer: true,
            customerUnread: 0,
            customerNudgeCount: 0,
          },
          { merge: true },
        )
        .catch(() => {});
      return;
    }

    // Is the customer away from the chat? (their heartbeat has gone stale)
    const lastTick = (c.customerLastTickAt as Timestamp | null)?.toMillis?.() ?? 0;
    const nowMs = Date.now();
    const away = nowMs - lastTick > AWAY_MS;

    // Keep the home-card preview current. Only COUNT toward the unread badge
    // while the customer is AWAY — if they're sitting in the chat reading a
    // burst, the badge stays at zero, so it never lingers after they read and
    // leave/end the chat.
    await cRef
      .set(
        {
          lastMessageText: preview,
          lastMessageAt: FieldValue.serverTimestamp(),
          lastMessageFromCustomer: false,
          customerUnread: away ? FieldValue.increment(1) : 0,
        },
        { merge: true },
      )
      .catch(() => {});

    if (!away) return; // present on the chat screen — no nudge

    const lastNudge = (c.lastCustomerNudgeAt as Timestamp | null)?.toMillis?.() ?? 0;
    const nudgeCount = (c.customerNudgeCount as number | undefined) ?? 0;
    if (nudgeCount >= MAX_NUDGES) return; // already nudged + reminded — stay quiet
    if (nowMs - lastNudge < NUDGE_THROTTLE_MS) return; // throttle bursts to one push

    // Re-read the freshly-incremented count for a truthful "N new messages".
    const unread = ((await cRef.get()).data()?.customerUnread as number | undefined) ?? 1;
    const { name, photo } = await astrologerBrief(c.astrologerId as string | undefined);
    const isRemedy = (m.type as string) === 'remedy';
    const body =
      unread > 1
        ? `${unread} new messages from ${name}`
        : isRemedy
          ? `${name} shared a remedy for you`
          : `${name} sent you a message`;

    // Writing a notification doc auto-pushes via onNotificationCreated.
    await db
      .collection('notifications')
      .add({
        userId: customerId,
        type: 'chat_message',
        title: name,
        body,
        deeplink: `asktro://chat/${consultationId}`,
        image: photo,
        consultationId,
        createdAt: FieldValue.serverTimestamp(),
        read: false,
      })
      .catch(() => {});

    await cRef
      .set(
        { lastCustomerNudgeAt: FieldValue.serverTimestamp(), customerNudgeCount: FieldValue.increment(1) },
        { merge: true },
      )
      .catch(() => {});
  },
);
