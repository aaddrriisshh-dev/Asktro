/**
 * Data retention (DPDP storage-limitation): scheduled jobs that keep the database
 * from growing without bound. ALL of it is DEFAULT OFF — nothing is ever deleted
 * until an operator sets `featureFlags.retention = true`. Even then only:
 *   - chat TRANSCRIPTS + media of ENDED consultations older than the window
 *     (`purgeOldChatData`) — the billing skeleton / consultation record is KEPT;
 *   - old in-app `notifications` and internal ops `alerts` (`purgeOldRecords`).
 *
 * NEVER touched: the money ledger (`walletTransactions`) and the consultation
 * documents themselves — those are permanent (accounting + history + retention UX).
 *
 * Windows come from config (chat/notification/alert RetentionDays), tunable from
 * the portal without a deploy. Some transient collections (rateLimits,
 * dailyStats/applied, prokeralaCache) self-expire via Firestore TTL policies —
 * a one-time console step, see each file header / the release checklist.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { db, bucket, FieldValue, Timestamp } from '../common/admin';
import { Collections } from '../common/collections';
import { getGlobalConfig } from '../common/config';

const DAY_MS = 86_400_000;
const RETENTION_STATE = 'ops'; // db.collection('ops').doc('retentionState')

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

/**
 * Strip chat transcript + media from consultations that ENDED longer ago than the
 * retention window, keeping the billing skeleton. Uses a persisted watermark
 * (`ops/retentionState.chatPurgeWatermarkMs`) so each run scans only NEW old
 * consultations — never re-reading the ever-growing pile of already-purged ones.
 * Consultations are purged in endTime order; the watermark only moves forward.
 * Exported (with an injectable `nowMs`) for integration testing.
 */
export async function purgeOldChatContent(days: number, nowMs: number, maxPerRun = 500): Promise<{ purged: number; processed: number }> {
  if (days <= 0) return { purged: 0, processed: 0 };
  const cutoff = Timestamp.fromMillis(nowMs - days * DAY_MS);
  const stateRef = db.collection(RETENTION_STATE).doc('retentionState');
  let watermarkMs = Number((await stateRef.get()).data()?.chatPurgeWatermarkMs) || 0;

  let processed = 0;
  let purged = 0;
  while (processed < maxPerRun) {
    const page = await db
      .collection(Collections.consultations)
      .where('endTime', '>', Timestamp.fromMillis(watermarkMs))
      .where('endTime', '<=', cutoff)
      .orderBy('endTime', 'asc')
      .limit(100)
      .get();
    if (page.empty) break;

    for (const doc of page.docs) {
      const c = doc.data();
      const endMs = (c.endTime as Timestamp | undefined)?.toMillis?.() ?? watermarkMs;
      if (c.chatPurged !== true && ['completed', 'expired', 'cancelled'].includes(c.status)) {
        await deleteCollection(doc.ref.collection('messages')).catch(() => {});
        await deleteCollection(doc.ref.collection('typing')).catch(() => {});
        await bucket.deleteFiles({ prefix: `chat_images/${doc.id}/` }).catch(() => {});
        await bucket.deleteFiles({ prefix: `voice_notes/${doc.id}/` }).catch(() => {});
        await doc.ref.set({ chatPurged: true, chatPurgedAt: FieldValue.serverTimestamp() }, { merge: true });
        purged++;
      }
      watermarkMs = Math.max(watermarkMs, endMs); // monotonic — never re-scan this doc
      processed++;
    }
    await stateRef.set({ chatPurgeWatermarkMs: watermarkMs, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (page.size < 100) break;
  }
  if (purged > 0) logger.info('purgeOldChatContent: stripped chat content', { purged, processed, retentionDays: days });
  return { purged, processed };
}

/**
 * Delete every doc in a collection whose `createdAt` is at/older than `cutoffMs`.
 * Safe to loop because deleted docs stop matching the filter. Bounded per run.
 * Exported for integration testing.
 */
export async function reapCollectionByAge(colName: string, cutoffMs: number, label: string, maxPerRun = 5000): Promise<number> {
  const cutoff = Timestamp.fromMillis(cutoffMs);
  let removed = 0;
  while (removed < maxPerRun) {
    const snap = await db.collection(colName).where('createdAt', '<=', cutoff).orderBy('createdAt', 'asc').limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    if (snap.size < 400) break;
  }
  if (removed > 0) logger.info('retention: reaped old records', { collection: label, removed });
  return removed;
}

// --- Scheduled wrappers (flag-gated; default OFF) -----------------------------

export const purgeOldChatData = onSchedule({ schedule: 'every 6 hours', timeoutSeconds: 540 }, async () => {
  const config = await getGlobalConfig();
  if (config.featureFlags?.retention !== true) return; // OFF until an operator enables it
  await purgeOldChatContent(config.chatRetentionDays ?? 0, Date.now());
});

export const purgeOldRecords = onSchedule({ schedule: 'every 24 hours', timeoutSeconds: 540 }, async () => {
  const config = await getGlobalConfig();
  if (config.featureFlags?.retention !== true) return; // OFF until an operator enables it
  const now = Date.now();

  const nDays = config.notificationRetentionDays ?? 0;
  if (nDays > 0) {
    await reapCollectionByAge(Collections.notifications, now - nDays * DAY_MS, 'notifications')
      .catch((e) => logger.error('reap notifications failed', { error: e instanceof Error ? e.message : String(e) }));
  }

  const aDays = config.alertRetentionDays ?? 0;
  if (aDays > 0) {
    await reapCollectionByAge('alerts', now - aDays * DAY_MS, 'alerts')
      .catch((e) => logger.error('reap alerts failed', { error: e instanceof Error ? e.message : String(e) }));
  }
});
