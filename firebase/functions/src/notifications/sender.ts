/**
 * Notification delivery:
 *  - onNotificationCreated: Firestore trigger that pushes an FCM message to the
 *    target user's registered device tokens whenever a notification doc is
 *    written (by any function). Centralizes push so callers just write a doc.
 *  - sendBroadcast (callable, admin): create notification docs for a segment
 *    (all users / astrologers / a list of uids) — fan-out then per-doc push.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { db, messaging, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { assertAdminTier, badRequest } from '../common/errors';
import { adminName } from '../common/actor';

export const onNotificationCreated = onDocumentCreated('notifications/{id}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const n = snap.data();
  const userId: string | undefined = n.userId;
  if (!userId || userId.startsWith('role:')) return; // broadcasts handled at fan-out

  // Customers store their FCM tokens on users/{uid}; astrologers are staff and
  // live in astrologers/{uid}. A notification's userId can be either, so read
  // the customer doc first and fall back to the astrologer doc. Prune stale
  // tokens from whichever collection actually supplied them.
  let tokenCollection: string = Collections.users;
  const userSnap = await db.collection(Collections.users).doc(userId).get();
  let tokens: string[] = userSnap.data()?.fcmTokens ?? [];
  if (tokens.length === 0) {
    const astroSnap = await db.collection(Collections.astrologers).doc(userId).get();
    tokens = astroSnap.data()?.fcmTokens ?? [];
    tokenCollection = Collections.astrologers;
  }
  if (tokens.length === 0) return;

  // A new consultation request rings loudly (heads-up + ringtone) even when the
  // astrologer app is backgrounded/closed, via the high-importance Android
  // channel the app created. Other notifications use normal priority.
  const isCall = n.type === 'consultation_request';

  const resp = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: n.title,
      body: n.body,
      ...(n.image ? { imageUrl: String(n.image) } : {}),
    },
    android: isCall
      ? {
          priority: 'high',
          notification: {
            channelId: 'incoming_consult',
            sound: 'incoming_ring',
            priority: 'max',
            defaultVibrateTimings: false,
            vibrateTimingsMillis: [0, 500, 500, 500],
          },
        }
      : { priority: 'normal' },
    ...(isCall
      ? { apns: { payload: { aps: { sound: 'default', 'interruption-level': 'time-sensitive' } } } }
      : {}),
    data: {
      type: String(n.type ?? ''),
      deeplink: String(n.deeplink ?? ''),
      image: String(n.image ?? ''),
      imageStyle: String(n.imageStyle ?? ''),
      displayMode: String(n.displayMode ?? 'small'),
      portraitImage: String(n.portraitImage ?? ''),
      ctaText: String(n.ctaText ?? ''),
      landingTitle: String(n.landingTitle ?? ''),
      landingBody: String(n.landingBody ?? ''),
      bgColor: String(n.bgColor ?? ''),
      textColor: String(n.textColor ?? ''),
      theme: String(n.theme ?? ''),
      notificationId: snap.id,
    },
  });

  // Prune tokens that are no longer valid.
  const stale: string[] = [];
  resp.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code ?? '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
        stale.push(tokens[i]);
      }
    }
  });
  if (stale.length) {
    await db.collection(tokenCollection).doc(userId).update({
      fcmTokens: FieldValue.arrayRemove(...stale),
    });
  }
});

export const sendBroadcast = onCall(
  // A paged per-user send (paid/unpaid, up to 200k) can run well past the 60s
  // default — give it room so it can't time out mid-fan-out (which, without the
  // broadcastId idempotency below, would double-send on retry).
  { timeoutSeconds: 540, memory: '512MiB' },
  async (req) => {
  const actor = assertAdminTier(req, ['super', 'ops']);
  const { title, body, type, deeplink, image, imageStyle, bgColor, textColor, displayMode, portraitImage, ctaText, landingTitle, landingBody, landingBgColor, landingTextColor, theme, segment, uids, broadcastId } = (req.data ?? {}) as {
    title?: string;
    body?: string;
    type?: string;
    deeplink?: string;
    image?: string;
    imageStyle?: 'banner' | 'portrait';
    bgColor?: string;
    textColor?: string;
    displayMode?: 'small' | 'half' | 'full';
    portraitImage?: string;
    ctaText?: string;
    landingTitle?: string;
    landingBody?: string;
    landingBgColor?: string;
    landingTextColor?: string;
    theme?: string;
    segment?: 'all_users' | 'paid_users' | 'unpaid_users' | 'astrologers' | 'list';
    uids?: string[];
    broadcastId?: string;
  };
  if (!title || !body) badRequest('title and body are required.');

  // Idempotency: the portal mints a broadcastId once per compose and reuses it on
  // retry. Claim it create-if-absent BEFORE sending, so a timed-out or
  // double-clicked send finds the id already claimed and never fans out twice.
  const bId = typeof broadcastId === 'string' && broadcastId.trim() ? broadcastId.trim() : null;
  const broadcastRef = bId ? db.collection('broadcasts').doc(bId) : db.collection('broadcasts').doc();
  if (bId) {
    try {
      await broadcastRef.create({ status: 'sending', title, body, segment: segment ?? 'all_users', createdAt: FieldValue.serverTimestamp() });
    } catch {
      return { ok: true, alreadySent: true };
    }
  }

  // Common data payload for every push (topic or per-user).
  const dataPayload: Record<string, string> = {
    type: String(type ?? 'announcement'),
    deeplink: String(deeplink ?? ''),
    image: String(image ?? ''),
    imageStyle: String(imageStyle ?? ''),
    displayMode: String(displayMode ?? 'small'),
    portraitImage: String(portraitImage ?? ''),
    ctaText: String(ctaText ?? ''),
    landingTitle: String(landingTitle ?? ''),
    landingBody: String(landingBody ?? ''),
    bgColor: String(bgColor ?? ''),
    textColor: String(textColor ?? ''),
    theme: String(theme ?? ''),
  };

  // Large, static audiences (all users / all astrologers) go out as ONE FCM
  // topic message — devices subscribe to the topic at token registration. This
  // avoids loading millions of user docs into memory and writing a doc + push
  // per user (the launch-scale hazard). The single `broadcasts` doc below is the
  // in-app record for these; the app surfaces it as a global announcement.
  const TOPIC: Record<string, string> = { all_users: 'all_users', astrologers: 'astrologers' };
  const topic = !segment || segment === 'all_users' ? TOPIC.all_users
    : segment === 'astrologers' ? TOPIC.astrologers
    : null;

  let delivered = 0;
  if (topic) {
    await messaging.send({
      topic,
      notification: { title, body, ...(image ? { imageUrl: String(image) } : {}) },
      data: dataPayload,
    });
    delivered = -1; // topic fan-out count is not known up-front
  } else {
    // Bounded, dynamic segments (paid/unpaid) or an explicit uid list. Stream
    // in pages so memory stays flat, cap the total, and write per-user docs
    // (the trigger pushes each) so they land in the in-app bell.
    const MAX_TARGETS = 200_000;
    async function collectPaged(): Promise<string[]> {
      if (segment === 'list') return (uids ?? []).slice(0, MAX_TARGETS);
      const op = segment === 'paid_users' ? '>' : '==';
      const ids: string[] = [];
      let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      // A range filter (paid_users '>') REQUIRES the first orderBy to be on that
      // same field, else Firestore rejects the query — so order by totalRecharge
      // first, with __name__ as a stable tiebreaker for the cursor. The equality
      // case ('==' unpaid) can order by __name__ alone. Both are served by the
      // automatic single-field index; no composite index needed.
      while (ids.length < MAX_TARGETS) {
        let q = db.collection(Collections.users).where('totalRecharge', op, 0);
        q = segment === 'paid_users'
          ? q.orderBy('totalRecharge').orderBy('__name__')
          : q.orderBy('__name__');
        q = q.limit(1000);
        if (cursor) q = q.startAfter(cursor);
        const page = await q.get();
        if (page.empty) break;
        for (const d of page.docs) if (d.data().accountStatus !== 'deleted') ids.push(d.id);
        cursor = page.docs[page.docs.length - 1];
        if (page.size < 1000) break;
      }
      return ids;
    }
    const targetIds = await collectPaged();
    delivered = targetIds.length;

    let batch = db.batch();
    let count = 0;
    for (const id of targetIds) {
      const ref = db.collection(Collections.notifications).doc();
      batch.set(ref, {
        userId: id, title, body,
        type: type ?? 'announcement',
        deeplink: deeplink ?? null, image: image ?? null, imageStyle: imageStyle ?? null,
        bgColor: bgColor ?? null, textColor: textColor ?? null, displayMode: displayMode ?? 'small',
        portraitImage: portraitImage ?? null, ctaText: ctaText ?? null,
        landingTitle: landingTitle ?? null, landingBody: landingBody ?? null,
        landingBgColor: landingBgColor ?? null, landingTextColor: landingTextColor ?? null,
        theme: theme ?? null, read: false, createdAt: FieldValue.serverTimestamp(),
      });
      if (++count % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (count % 400 !== 0) await batch.commit();
  }

  const actorName = await adminName(actor);

  // One compact summary per send, so the portal can list broadcast history
  // (the per-user notification docs above are the actual delivered messages).
  // Written to the claimed idempotency doc (merge) when a broadcastId was given,
  // else a fresh doc — either way one row per send.
  await broadcastRef.set({
    status: 'sent',
    title,
    body,
    segment: segment ?? 'all_users',
    type: type ?? 'announcement',
    theme: theme ?? null,
    displayMode: displayMode ?? 'small',
    image: image ?? null,
    deeplink: deeplink ?? null,
    delivered: delivered >= 0 ? delivered : null,
    channel: topic ? 'topic' : 'per_user',
    // Full payload so the app can render a topic broadcast as a rich in-app
    // announcement (topic sends write no per-user doc).
    imageStyle: imageStyle ?? null,
    portraitImage: portraitImage ?? null,
    ctaText: ctaText ?? null,
    landingTitle: landingTitle ?? null,
    landingBody: landingBody ?? null,
    bgColor: bgColor ?? null,
    textColor: textColor ?? null,
    sentBy: actor,
    sentByName: actorName,
    createdAt: FieldValue.serverTimestamp(),
  });

  await db.collection(Collections.auditLogs).add({
    actorUid: actor, actorRole: 'admin', actorName,
    action: 'sendBroadcast', targetType: 'segment', targetId: segment ?? 'all_users',
    after: { title, delivered, channel: topic ? 'topic' : 'per_user' }, createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, delivered, channel: topic ? 'topic' : 'per_user' };
});
