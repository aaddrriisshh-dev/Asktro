/**
 * purgeOldChatData — data-minimisation / retention (DPDP storage-limitation).
 *
 * When enabled (config.featureFlags.retention === true AND
 * config.chatRetentionDays > 0), a daily job strips the chat transcript + chat
 * media from consultations that ENDED longer ago than the retention window,
 * keeping only the billing skeleton (a financial record). DEFAULT OFF, so it
 * never deletes anything until an operator deliberately sets a retention policy.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { db, bucket, FieldValue, Timestamp } from '../common/admin';
import { Collections } from '../common/collections';
import { getGlobalConfig } from '../common/config';

async function deleteCollection(ref: FirebaseFirestore.CollectionReference, pageSize = 300): Promise<void> {
  for (;;) {
    const snap = await ref.limit(pageSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snap.size < pageSize) break;
  }
}

export const purgeOldChatData = onSchedule('every 24 hours', async () => {
  const config = await getGlobalConfig();
  const days = config.chatRetentionDays ?? 0;
  if (config.featureFlags?.retention !== true || days <= 0) return; // disabled by default

  const cutoff = Timestamp.fromMillis(Date.now() - days * 86_400_000);
  // endTime<=cutoff is a single-field range (auto-indexed) and naturally excludes
  // still-open sessions (their endTime is null). Filter status client-side to
  // avoid needing a composite index.
  const old = await db
    .collection(Collections.consultations)
    .where('endTime', '<=', cutoff)
    .limit(200)
    .get();

  let purged = 0;
  for (const doc of old.docs) {
    const c = doc.data();
    if (c.chatPurged === true) continue;
    if (!['completed', 'expired', 'cancelled'].includes(c.status)) continue;

    await deleteCollection(doc.ref.collection('messages')).catch(() => {});
    await deleteCollection(doc.ref.collection('typing')).catch(() => {});
    await bucket.deleteFiles({ prefix: `chat_images/${doc.id}/` }).catch(() => {});
    await bucket.deleteFiles({ prefix: `voice_notes/${doc.id}/` }).catch(() => {});
    await doc.ref.set({ chatPurged: true, chatPurgedAt: FieldValue.serverTimestamp() }, { merge: true });
    purged++;
  }
  if (purged > 0) logger.info('purgeOldChatData: stripped chat content', { purged, retentionDays: days });
});
