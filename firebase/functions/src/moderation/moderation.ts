/**
 * Content moderation — the safety surface the app stores (Apple UGC 1.2 / Play
 * UGC) require on a two-sided chat with images:
 *   - reportContent  : any participant reports a user/message/consultation.
 *   - blockUser / unblockUser : a user blocks another; blocks prevent new
 *     consultations in either direction.
 *   - onChatMessageCreated : server-side profanity/abuse flagging on every chat
 *     message (Admin SDK write, so it can flag even though clients wrote it).
 *   - onChatImageUploaded : quarantine pipeline for chat images. If the optional
 *     Cloud Vision SafeSearch integration is enabled it auto-deletes adult /
 *     violent images; otherwise it records the image for admin review.
 *
 * `assertNotBlocked` is imported by createConsultation to enforce blocks.
 */
import { onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { logger } from 'firebase-functions/v2';
import { db, bucket, FieldValue } from '../common/admin';
import { getGlobalConfig } from '../common/config';
import { assertAuthed, badRequest } from '../common/errors';

// ---- blocks ----------------------------------------------------------------

function blockDoc(uid: string) {
  return db.collection('userBlocks').doc(uid);
}

/** True if either party has blocked the other. Reads two small docs. */
export async function isBlocked(a: string, b: string): Promise<boolean> {
  const [ab, ba] = await Promise.all([blockDoc(a).get(), blockDoc(b).get()]);
  const aBlocked = (ab.data()?.blocked ?? []) as string[];
  const bBlocked = (ba.data()?.blocked ?? []) as string[];
  return aBlocked.includes(b) || bBlocked.includes(a);
}

/** Throws failed-precondition if a and b cannot interact due to a block. */
export async function assertNotBlocked(a: string, b: string): Promise<void> {
  if (await isBlocked(a, b)) {
    const { HttpsError } = await import('firebase-functions/v2/https');
    throw new HttpsError('failed-precondition', 'This user is unavailable.');
  }
}

export const blockUser = onCall(async (req) => {
  const uid = assertAuthed(req);
  const { targetId } = (req.data ?? {}) as { targetId?: string };
  if (!targetId) badRequest('targetId is required.');
  if (targetId === uid) badRequest('You cannot block yourself.');
  await blockDoc(uid).set(
    { blocked: FieldValue.arrayUnion(targetId), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return { ok: true };
});

export const unblockUser = onCall(async (req) => {
  const uid = assertAuthed(req);
  const { targetId } = (req.data ?? {}) as { targetId?: string };
  if (!targetId) badRequest('targetId is required.');
  await blockDoc(uid).set(
    { blocked: FieldValue.arrayRemove(targetId), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return { ok: true };
});

// ---- reports ---------------------------------------------------------------

const REPORT_REASONS = ['abuse', 'harassment', 'nudity', 'spam', 'scam', 'fraud', 'other'];

export const reportContent = onCall(async (req) => {
  const reporterId = assertAuthed(req);
  const { reportedId, consultationId, messageId, reason, detail } = (req.data ?? {}) as {
    reportedId?: string;
    consultationId?: string;
    messageId?: string;
    reason?: string;
    detail?: string;
  };
  if (!reportedId) badRequest('reportedId is required.');
  const r = REPORT_REASONS.includes(reason ?? '') ? reason! : 'other';

  await db.collection('reports').add({
    reporterId,
    reportedId,
    consultationId: consultationId ?? null,
    messageId: messageId ?? null,
    reason: r,
    detail: (detail ?? '').slice(0, 1000),
    status: 'open',
    createdAt: FieldValue.serverTimestamp(),
  });

  // Surface to admins.
  await db.collection('alerts').add({
    kind: 'user_report',
    severity: 'warning',
    message: `User ${reporterId} reported ${reportedId} (${r}).`,
    refId: reportedId,
    resolved: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

// ---- text moderation -------------------------------------------------------

// Minimal server-side abuse/profanity screen. This is a floor (fast, no external
// dependency, catches the obvious), not a replacement for a full moderation
// service — it flags for admin review rather than blocking delivery.
const BANNED = [
  '\\bf+u+c+k', '\\bs+h+i+t', '\\bb+i+t+c+h', '\\bc+u+n+t', '\\ba+s+s+h+o+l+e',
  '\\bn+i+g+g', '\\br+a+p+e\\b', '\\bk+i+l+l\\s+y+o+u', '\\bwhatsapp\\b', '\\btelegram\\b',
  // contact-info exfiltration attempts (bypassing in-app billing / privacy)
  '\\b\\d{10}\\b', '\\b\\+?\\d{2}[\\s-]?\\d{10}\\b',
];
const BANNED_RE = new RegExp(BANNED.join('|'), 'i');

export const onChatMessageCreated = onDocumentCreated(
  'consultations/{consultationId}/messages/{messageId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const text = (snap.data()?.text ?? '') as string;
    if (!text || !BANNED_RE.test(text)) return;

    await snap.ref.set({ flagged: true, flaggedReason: 'auto_text', flaggedAt: FieldValue.serverTimestamp() }, { merge: true });
    await db.collection('alerts').add({
      kind: 'flagged_message',
      severity: 'warning',
      message: `Flagged message in consultation ${event.params.consultationId}.`,
      refId: event.params.consultationId,
      resolved: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    logger.info('onChatMessageCreated: flagged message', { consultationId: event.params.consultationId, messageId: event.params.messageId });
  },
);

// ---- image moderation ------------------------------------------------------

/**
 * Chat images land in Storage under chat_images/{consultationId}/{file}. We
 * record every one for review, and — when config.imageModerationEnabled is true
 * and the Cloud Vision package + API are provisioned — auto-scan for adult /
 * violent content and delete + flag anything that trips the SafeSearch bar.
 *
 * The Vision client is loaded via a NON-LITERAL dynamic import so the build never
 * hard-depends on '@google-cloud/vision' being installed; enabling real scanning
 * is a provisioning step (install the dep + enable the Vision API), not a code
 * change. Until then, images are queued for manual admin review.
 */
export const onChatImageUploaded = onObjectFinalized(async (event) => {
  const name = event.data.name ?? '';
  if (!name.startsWith('chat_images/')) return;
  const parts = name.split('/');
  const consultationId = parts[1] ?? null;

  const record: Record<string, unknown> = {
    path: name,
    consultationId,
    contentType: event.data.contentType ?? null,
    size: Number(event.data.size ?? 0),
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
  };

  const config = await getGlobalConfig();
  if (config.featureFlags?.imageModeration === true) {
    try {
      const pkg = '@google-cloud/vision';
      // Non-literal specifier: not statically resolved, so tsc/build never needs
      // the package present.
      const vision: any = await import(pkg); // eslint-disable-line @typescript-eslint/no-explicit-any
      const client = new vision.ImageAnnotatorClient();
      const [result] = await client.safeSearchDetection(`gs://${bucket.name}/${name}`);
      const s = result.safeSearchAnnotation ?? {};
      const bad = ['LIKELY', 'VERY_LIKELY'];
      const unsafe = bad.includes(s.adult) || bad.includes(s.violence) || bad.includes(s.racy);
      if (unsafe) {
        await bucket.file(name).delete().catch(() => {});
        record.status = 'removed';
        record.safeSearch = s;
        await db.collection('alerts').add({
          kind: 'nsfw_image_removed',
          severity: 'critical',
          message: `Auto-removed unsafe chat image in consultation ${consultationId}.`,
          refId: consultationId,
          resolved: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      } else {
        record.status = 'passed';
        record.safeSearch = s;
      }
    } catch (e) {
      // Provisioning incomplete or scan failed — leave the image pending review.
      logger.warn('onChatImageUploaded: vision scan unavailable', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  await db.collection('imageModeration').add(record);
});
