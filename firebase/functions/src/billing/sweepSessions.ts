/**
 * sweepStaleSessions — scheduled safety net (every 1 min). Two jobs:
 *  1. Bill any `active` session whose client heartbeat is late (covers app
 *     kills / lost connections so we never lose or over-charge time).
 *  2. Auto-end `paused` sessions that have exceeded the session timeout.
 * Uses the same transactional `applyTick` as the client heartbeat.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, FieldValue, Timestamp } from '../common/admin';
import { Collections } from '../common/collections';
import { getGlobalConfig } from '../common/config';
import { applyTick } from './tickConsultation';
import { astrologerNetEarning } from './engine';

export const sweepStaleSessions = onSchedule('every 1 minutes', async () => {
  const config = await getGlobalConfig();
  const nowMs = Timestamp.now().toMillis();

  // --- 1. Late-heartbeat active sessions (lastTickAt older than 30s) ---
  const staleCutoff = Timestamp.fromMillis(nowMs - 30_000);
  const activeStale = await db
    .collection(Collections.consultations)
    .where('status', '==', 'active')
    .where('lastTickAt', '<=', staleCutoff)
    .limit(200)
    .get();

  for (const doc of activeStale.docs) {
    await db.runTransaction(async (tx) => {
      await applyTick(tx, doc.id, config, Timestamp.now().toMillis());
    });
  }

  // --- 2. Paused sessions past the session timeout → auto-end ---
  const pausedCutoff = Timestamp.fromMillis(nowMs - config.sessionTimeoutSec * 1000);
  const expiredPaused = await db
    .collection(Collections.consultations)
    .where('status', '==', 'paused')
    .where('pausedAt', '<=', pausedCutoff)
    .limit(200)
    .get();

  for (const doc of expiredPaused.docs) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      if (!snap.exists) return;
      const c = snap.data()!;
      if (c.status !== 'paused') return;

      const net = astrologerNetEarning(c.totalCharged ?? 0, config.commissionPercent);
      tx.update(doc.ref, {
        status: 'expired',
        paymentStatus: 'settled',
        endTime: FieldValue.serverTimestamp(),
        duration: c.billedSeconds ?? 0,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(
        db.collection(Collections.astrologers).doc(c.astrologerId),
        {
          available: true,
          earnings: FieldValue.increment(net),
          pendingPayout: FieldValue.increment(net),
          totalConsultations: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
  }
});
