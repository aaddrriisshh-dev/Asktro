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
import { assertRole, badRequest } from '../common/errors';
import { adminName } from '../common/actor';

export const onNotificationCreated = onDocumentCreated('notifications/{id}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const n = snap.data();
  const userId: string | undefined = n.userId;
  if (!userId || userId.startsWith('role:')) return; // broadcasts handled at fan-out

  const userSnap = await db.collection(Collections.users).doc(userId).get();
  const tokens: string[] = userSnap.data()?.fcmTokens ?? [];
  if (tokens.length === 0) return;

  const resp = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: n.title,
      body: n.body,
      ...(n.image ? { imageUrl: String(n.image) } : {}),
    },
    data: {
      type: String(n.type ?? ''),
      deeplink: String(n.deeplink ?? ''),
      image: String(n.image ?? ''),
      imageStyle: String(n.imageStyle ?? ''),
      displayMode: String(n.displayMode ?? 'small'),
      portraitImage: String(n.portraitImage ?? ''),
      ctaText: String(n.ctaText ?? ''),
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
    await db.collection(Collections.users).doc(userId).update({
      fcmTokens: FieldValue.arrayRemove(...stale),
    });
  }
});

export const sendBroadcast = onCall(async (req) => {
  const actor = assertRole(req, 'admin');
  const { title, body, type, deeplink, image, imageStyle, bgColor, textColor, displayMode, portraitImage, ctaText, landingTitle, landingBody, landingBgColor, landingTextColor, theme, segment, uids } = (req.data ?? {}) as {
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
  };
  if (!title || !body) badRequest('title and body are required.');

  let targetIds: string[] = [];
  if (segment === 'list') {
    targetIds = uids ?? [];
  } else if (segment === 'astrologers') {
    const snap = await db.collection(Collections.astrologers).where('accountStatus', '==', 'approved').get();
    targetIds = snap.docs.map((d) => d.id);
  } else if (segment === 'paid_users' || segment === 'unpaid_users') {
    // Single-field query (auto-indexed); drop deleted accounts client-side.
    const op = segment === 'paid_users' ? '>' : '==';
    const snap = await db.collection(Collections.users).where('totalRecharge', op, 0).get();
    targetIds = snap.docs.filter((d) => d.data().accountStatus !== 'deleted').map((d) => d.id);
  } else {
    const snap = await db.collection(Collections.users).where('accountStatus', '==', 'active').get();
    targetIds = snap.docs.map((d) => d.id);
  }

  // Write one notification doc per target; the trigger above pushes each.
  let batch = db.batch();
  let count = 0;
  for (const id of targetIds) {
    const ref = db.collection(Collections.notifications).doc();
    batch.set(ref, {
      userId: id,
      title,
      body,
      type: type ?? 'announcement',
      deeplink: deeplink ?? null,
      image: image ?? null,
      imageStyle: imageStyle ?? null,
      bgColor: bgColor ?? null,
      textColor: textColor ?? null,
      displayMode: displayMode ?? 'small',
      portraitImage: portraitImage ?? null,
      ctaText: ctaText ?? null,
      landingTitle: landingTitle ?? null,
      landingBody: landingBody ?? null,
      landingBgColor: landingBgColor ?? null,
      landingTextColor: landingTextColor ?? null,
      theme: theme ?? null,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (++count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 400 !== 0) await batch.commit();

  await db.collection(Collections.auditLogs).add({
    actorUid: actor, actorRole: 'admin', actorName: await adminName(actor),
    action: 'sendBroadcast', targetType: 'segment', targetId: segment ?? 'all_users',
    after: { title, delivered: targetIds.length }, createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, delivered: targetIds.length };
});
