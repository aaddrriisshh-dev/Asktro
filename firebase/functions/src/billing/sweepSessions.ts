/**
 * sweepStaleSessions — scheduled safety net (every 1 min). Four independent
 * jobs, each isolated so one failing (e.g. a missing index) never blocks the
 * others:
 *  1. Bill any `active` session whose client heartbeat is late (covers app
 *     kills / lost connections so we never lose or over-charge time).
 *  2. Auto-end `paused` sessions that have exceeded the session timeout.
 *  3. Expire `waiting` requests never accepted within requestTimeoutSec, and
 *     FREE the reserved astrologer. Without this, an abandoned request (customer
 *     closes the app before the astrologer accepts) strands the astrologer as
 *     `available: false` forever — permanently unable to take new consultations.
 *  4. Reconcile orphaned availability: any human astrologer marked
 *     `available: false` with no open CALL is freed. Self-heals flags left stuck
 *     by crashes, out-of-band deletes, partial failures, or legacy data.
 * Uses the same transactional `applyTick` as the client heartbeat.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, FieldValue, Timestamp } from '../common/admin';
import { Collections } from '../common/collections';
import { getGlobalConfig } from '../common/config';
import { GlobalConfig } from '../common/types';
import { applyTick } from './tickConsultation';
import { astrologerNetEarning } from './engine';

const OPEN_STATUSES = ['waiting', 'active', 'paused'];
const isCall = (type: unknown) => type === 'voice' || type === 'video';

export const sweepStaleSessions = onSchedule('every 1 minutes', async () => {
  const config = await getGlobalConfig();
  const nowMs = Timestamp.now().toMillis();

  // Run every job even if a prior one throws (isolated failure domains).
  const jobs: Array<[string, () => Promise<void>]> = [
    ['billStaleActive', () => billStaleActive(config, nowMs)],
    ['expirePaused', () => expirePaused(config, nowMs)],
    ['expireWaiting', () => expireWaiting(config, nowMs)],
    ['reconcileAvailability', () => reconcileAvailability()],
  ];
  for (const [name, run] of jobs) {
    try {
      await run();
    } catch (err) {
      console.error(`sweepStaleSessions: job "${name}" failed`, err);
    }
  }
});

// --- 1. Late-heartbeat active sessions (lastTickAt older than 30s) ---
async function billStaleActive(config: GlobalConfig, nowMs: number): Promise<void> {
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
}

// --- 2. Paused sessions past the session timeout → auto-end ---
async function expirePaused(config: GlobalConfig, nowMs: number): Promise<void> {
  const pausedCutoff = Timestamp.fromMillis(nowMs - config.sessionTimeoutSec * 1000);
  const expired = await db
    .collection(Collections.consultations)
    .where('status', '==', 'paused')
    .where('pausedAt', '<=', pausedCutoff)
    .limit(200)
    .get();

  for (const doc of expired.docs) {
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
      const update: Record<string, unknown> = {
        earnings: FieldValue.increment(net),
        pendingPayout: FieldValue.increment(net),
        totalConsultations: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      };
      // Release the exclusive lock only for a call — chats never held it.
      if (isCall(c.type)) update.available = true;
      tx.set(db.collection(Collections.astrologers).doc(c.astrologerId), update, { merge: true });
    });
  }
}

// --- 3. Waiting requests never accepted → expire and free the astrologer ---
// The session never started: NO billing, NO earnings credit, NOT counted.
async function expireWaiting(config: GlobalConfig, nowMs: number): Promise<void> {
  const waitingCutoff = Timestamp.fromMillis(nowMs - config.requestTimeoutSec * 1000);
  const staleWaiting = await db
    .collection(Collections.consultations)
    .where('status', '==', 'waiting')
    .where('createdAt', '<=', waitingCutoff)
    .limit(200)
    .get();

  for (const doc of staleWaiting.docs) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      if (!snap.exists) return;
      const c = snap.data()!;
      if (c.status !== 'waiting') return; // may have just been accepted

      tx.update(doc.ref, {
        status: 'expired',
        paymentStatus: 'settled',
        endTime: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      // Only an unaccepted call held the exclusive lock; a chat never did.
      if (isCall(c.type)) {
        tx.set(
          db.collection(Collections.astrologers).doc(c.astrologerId),
          { available: true, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      }
    });
  }
}

// --- 4. Reconcile orphaned availability flags ---
// `available == false` should mean "on or awaiting a voice/video call". Any
// human astrologer marked busy with no open CALL is a stuck flag — free them.
async function reconcileAvailability(): Promise<void> {
  const busy = await db
    .collection(Collections.astrologers)
    .where('available', '==', false)
    .limit(300)
    .get();

  for (const astro of busy.docs) {
    if (astro.data().isAI === true) continue;
    const open = await db
      .collection(Collections.consultations)
      .where('astrologerId', '==', astro.id)
      .where('status', 'in', OPEN_STATUSES)
      .limit(20)
      .get();
    if (open.docs.some((d) => isCall(d.data().type))) continue; // genuinely on a call
    await astro.ref.set(
      { available: true, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
}
