/**
 * Notification delivery:
 *  - onNotificationCreated: Firestore trigger that pushes an FCM message to the
 *    target user's registered device tokens whenever a notification doc is
 *    written (by any function). Centralizes push so callers just write a doc.
 *  - sendBroadcast (callable, admin): create notification docs for a segment
 *    (all users / astrologers / a list of uids) — fan-out then per-doc push.
 *    Large static audiences go out as ONE FCM topic; dynamic segments stream in
 *    pages with the cursor CHECKPOINTED so the send is resumable (#49).
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

// ---- Broadcast (segment fan-out) ---------------------------------------------

export interface BroadcastParams {
  title: string;
  body: string;
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
}

/** The per-user notification doc the onNotificationCreated trigger pushes. */
function buildNotifDoc(uid: string, p: BroadcastParams) {
  return {
    userId: uid, title: p.title, body: p.body,
    type: p.type ?? 'announcement',
    deeplink: p.deeplink ?? null, image: p.image ?? null, imageStyle: p.imageStyle ?? null,
    bgColor: p.bgColor ?? null, textColor: p.textColor ?? null, displayMode: p.displayMode ?? 'small',
    portraitImage: p.portraitImage ?? null, ctaText: p.ctaText ?? null,
    landingTitle: p.landingTitle ?? null, landingBody: p.landingBody ?? null,
    landingBgColor: p.landingBgColor ?? null, landingTextColor: p.landingTextColor ?? null,
    theme: p.theme ?? null, read: false, createdAt: FieldValue.serverTimestamp(),
  };
}

const MAX_TARGETS = 200_000;

/**
 * Deliver a broadcast, RESUMABLE across invocations (#49).
 *
 * - **all_users / astrologers** → ONE FCM topic message (devices subscribe at
 *   token registration). O(1) regardless of audience size — never a timeout risk.
 * - **paid_users / unpaid_users / list** → a notification doc per user (the
 *   onNotificationCreated trigger pushes each), streamed in pages. After every
 *   page the cursor + count are CHECKPOINTED on the broadcast doc, so an
 *   invocation that hits the soft time budget returns `complete:false` and a
 *   re-invoke (same broadcastId) continues from the checkpoint instead of
 *   restarting or stalling.
 *
 * Reads any prior checkpoint from `broadcastRef`. Pure Firestore for the per-user
 * path (no FCM in this function — the trigger sends), so it is emulator-testable.
 */
export async function runBroadcast(
  broadcastRef: FirebaseFirestore.DocumentReference,
  params: BroadcastParams,
  opts: { softDeadlineMs?: number; pageSize?: number; now?: () => number } = {},
): Promise<{ delivered: number; channel: 'topic' | 'per_user'; complete: boolean }> {
  const { segment, uids } = params;
  const now = opts.now ?? (() => Date.now());
  const softDeadlineMs = opts.softDeadlineMs ?? 480_000; // headroom under the 540s hard cap
  const pageSize = opts.pageSize ?? 1000;
  const started = now();

  const topic = !segment || segment === 'all_users' ? 'all_users'
    : segment === 'astrologers' ? 'astrologers'
    : null;

  if (topic) {
    await messaging.send({
      topic,
      notification: { title: params.title, body: params.body, ...(params.image ? { imageUrl: String(params.image) } : {}) },
      data: {
        type: String(params.type ?? 'announcement'),
        deeplink: String(params.deeplink ?? ''),
        image: String(params.image ?? ''),
        imageStyle: String(params.imageStyle ?? ''),
        displayMode: String(params.displayMode ?? 'small'),
        portraitImage: String(params.portraitImage ?? ''),
        ctaText: String(params.ctaText ?? ''),
        landingTitle: String(params.landingTitle ?? ''),
        landingBody: String(params.landingBody ?? ''),
        bgColor: String(params.bgColor ?? ''),
        textColor: String(params.textColor ?? ''),
        theme: String(params.theme ?? ''),
      },
    });
    return { delivered: -1, channel: 'topic', complete: true };
  }

  // Per-user fan-out. Resume from the last checkpoint on the broadcast doc.
  const saved = (await broadcastRef.get()).data() ?? {};
  let sentCount: number = saved.sentCount ?? 0;

  // --- explicit uid list: `sentCount` doubles as the resume index ---
  if (segment === 'list') {
    const all = (uids ?? []).slice(0, MAX_TARGETS);
    let complete = true;
    let batch = db.batch(); let inBatch = 0;
    while (sentCount < all.length) {
      batch.set(db.collection(Collections.notifications).doc(), buildNotifDoc(all[sentCount], params));
      inBatch++; sentCount++;
      if (inBatch % 400 === 0) {
        await batch.commit(); batch = db.batch();
        await broadcastRef.set({ sentCount, status: 'sending' }, { merge: true });
        if (now() - started > softDeadlineMs) { complete = false; break; }
      }
    }
    if (inBatch % 400 !== 0) await batch.commit();
    await broadcastRef.set({ sentCount, status: 'sending' }, { merge: true });
    return { delivered: sentCount, channel: 'per_user', complete };
  }

  // --- paid_users / unpaid_users: paged query with a checkpointed cursor ---
  // A range filter (paid '>') must order by that field first. We page with a
  // DocumentSnapshot cursor (works for any orderBy) and checkpoint its id; on
  // resume we re-fetch that anchor doc. If the exact anchor was deleted between a
  // timed-out send and its resume (rare), we restart — some notifications for the
  // overlap re-send, which is harmless (non-money).
  const op = segment === 'paid_users' ? '>' : '==';
  let cursor: FirebaseFirestore.DocumentSnapshot | null = null;
  if (saved.cursorId) {
    const anchor = await db.collection(Collections.users).doc(saved.cursorId as string).get();
    if (anchor.exists) cursor = anchor;
  }
  let complete = true;
  while (sentCount < MAX_TARGETS) {
    let q = db.collection(Collections.users).where('totalRecharge', op, 0);
    q = segment === 'paid_users' ? q.orderBy('totalRecharge').orderBy('__name__') : q.orderBy('__name__');
    if (cursor) q = q.startAfter(cursor);
    q = q.limit(pageSize);
    const page = await q.get();
    if (page.empty) break;

    let batch = db.batch(); let inBatch = 0;
    for (const dsnap of page.docs) {
      if (dsnap.data().accountStatus === 'deleted') continue;
      batch.set(db.collection(Collections.notifications).doc(), buildNotifDoc(dsnap.id, params));
      if (++inBatch % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (inBatch % 400 !== 0) await batch.commit();
    sentCount += inBatch;

    cursor = page.docs[page.docs.length - 1];
    await broadcastRef.set({ cursorId: cursor.id, sentCount, status: 'sending' }, { merge: true });

    if (page.size < pageSize) break; // last page
    if (now() - started > softDeadlineMs) { complete = false; break; }
  }
  return { delivered: sentCount, channel: 'per_user', complete };
}

export const sendBroadcast = onCall(
  // A paged per-user send can run past the 60s default — give it room. The
  // checkpoint in runBroadcast makes a timed-out send resumable rather than a
  // stuck partial; the broadcastId claim below stops a double-CLICK re-send.
  { timeoutSeconds: 540, memory: '512MiB' },
  async (req) => {
    const actor = assertAdminTier(req, ['super', 'ops']);
    const d = (req.data ?? {}) as BroadcastParams & { broadcastId?: string };
    if (!d.title || !d.body) badRequest('title and body are required.');

    // Idempotency + resume. The portal mints a broadcastId once per compose and
    // reuses it on retry. Claim it create-if-absent: a fresh id starts a new send;
    // an existing 'sent' id is a duplicate → no-op; an existing 'sending' id means
    // a prior run stopped mid-fan-out → runBroadcast resumes from its checkpoint.
    const bId = typeof d.broadcastId === 'string' && d.broadcastId.trim() ? d.broadcastId.trim() : null;
    const broadcastRef = bId ? db.collection('broadcasts').doc(bId) : db.collection('broadcasts').doc();
    if (bId) {
      try {
        await broadcastRef.create({
          status: 'sending', title: d.title, body: d.body,
          segment: d.segment ?? 'all_users', sentCount: 0, createdAt: FieldValue.serverTimestamp(),
        });
      } catch {
        const cur = (await broadcastRef.get()).data();
        if (cur?.status === 'sent') return { ok: true, alreadySent: true };
        // else fall through — resume from the checkpoint.
      }
    }

    const { delivered, channel, complete } = await runBroadcast(broadcastRef, d);
    const actorName = await adminName(actor);

    // Finalize only when the fan-out actually completed. A partial send stays
    // 'sending' with its checkpoint so a re-invoke resumes it.
    if (complete) {
      await broadcastRef.set({
        status: 'sent',
        title: d.title, body: d.body,
        segment: d.segment ?? 'all_users',
        type: d.type ?? 'announcement',
        theme: d.theme ?? null,
        displayMode: d.displayMode ?? 'small',
        image: d.image ?? null,
        deeplink: d.deeplink ?? null,
        delivered: delivered >= 0 ? delivered : null,
        channel,
        imageStyle: d.imageStyle ?? null,
        portraitImage: d.portraitImage ?? null,
        ctaText: d.ctaText ?? null,
        landingTitle: d.landingTitle ?? null,
        landingBody: d.landingBody ?? null,
        bgColor: d.bgColor ?? null,
        textColor: d.textColor ?? null,
        sentBy: actor,
        sentByName: actorName,
        sentAt: FieldValue.serverTimestamp(),
        ...(bId ? {} : { createdAt: FieldValue.serverTimestamp() }),
      }, { merge: true });

      await db.collection(Collections.auditLogs).add({
        actorUid: actor, actorRole: 'admin', actorName,
        action: 'sendBroadcast', targetType: 'segment', targetId: d.segment ?? 'all_users',
        after: { title: d.title, delivered, channel }, createdAt: FieldValue.serverTimestamp(),
      });
    }

    return { ok: true, delivered, channel, complete };
  },
);
