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
import { logger } from 'firebase-functions/v2';
import { db, FieldValue, Timestamp } from '../common/admin';
import { Collections } from '../common/collections';
import { getGlobalConfig } from '../common/config';
import { GlobalConfig } from '../common/types';
import { applyTick } from './tickConsultation';
import { astrologerNetEarning, MAX_TICK_ELAPSED_MS } from './engine';
import { writeAstrologerLedger } from '../wallet/ledger';

const OPEN_STATUSES = ['waiting', 'active', 'paused'];
const isCall = (type: unknown) => type === 'voice' || type === 'video';

// Per-job scan ceiling. Raised from 200 now that each job drains its batch in
// bounded-parallel chunks (below) rather than one transaction at a time.
const SWEEP_LIMIT = 500;
// Concurrent transactions per job. Bounded so a large batch drains fast without
// spawning hundreds of simultaneous transactions.
const SWEEP_CONCURRENCY = 40;

/** Run `fn` over `items` with bounded concurrency; a per-item failure is
 *  isolated (logged, never aborts the batch). */
async function forEachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += limit) {
    await Promise.all(
      items.slice(i, i + limit).map((it) =>
        fn(it).catch((err) => logger.error('sweep item failed', { error: err instanceof Error ? err.message : String(err) })),
      ),
    );
  }
}

export const sweepStaleSessions = onSchedule(
  // 300s timeout (up from the 60s default) so a large backlog can't kill the run
  // mid-way and skip the reconcile jobs.
  { schedule: 'every 1 minutes', timeoutSeconds: 300, memory: '512MiB' },
  async () => {
    const config = await getGlobalConfig();
    const nowMs = Timestamp.now().toMillis();

    // Run the jobs CONCURRENTLY, each isolated — so a slow billStaleActive can
    // never starve reconcileAvailability/reconcileStaleOnline (the old sequential
    // loop blew the timeout before jobs 4-5 ran during correlated disconnects).
    const jobs: Array<[string, () => Promise<void>]> = [
      ['billStaleActive', () => billStaleActive(config, nowMs)],
      ['expirePaused', () => expirePaused(config, nowMs)],
      ['expireWaiting', () => expireWaiting(config, nowMs)],
      ['reconcileAvailability', () => reconcileAvailability()],
      ['reconcileStaleOnline', () => reconcileStaleOnline(nowMs)],
    ];
    await Promise.allSettled(
      jobs.map(([name, run]) =>
        run().catch((err) => logger.error('sweepStaleSessions: job failed', { job: name, error: err instanceof Error ? err.message : String(err) })),
      ),
    );
  },
);

// --- 1. Disconnected active sessions → bill a short settle window, then PAUSE ---
// A live client sends a heartbeat every ~10s. If we have NOT heard from it for
// longer than the reconnect grace, the customer is gone (app killed / network
// lost). We must NOT keep billing wall-clock dead air until the wallet drains —
// that is the "charged me after it disconnected" leak. Instead we bill only a
// small settle window past the last confirmed contact (covers one missed tick),
// then PAUSE the session (networkStatus 'reconnecting'). If the client comes
// back it resumes; if it never does, expirePaused settles it after the timeout.
// Single source of truth, shared with the live tick path (see engine.ts).
const STALE_BILL_SETTLE_MS = MAX_TICK_ELAPSED_MS;

export async function billStaleActive(config: GlobalConfig, nowMs: number): Promise<void> {
  // Only touch sessions silent BEYOND the reconnect grace (floored at 30s so a
  // misconfigured tiny reconnectTimeoutSec can never pause live sessions). A
  // brief blip that recovers updates lastTickAt on its own next tick and is
  // never seen here.
  const graceMs = Math.max(30, config.reconnectTimeoutSec || 45) * 1000;
  const staleCutoff = Timestamp.fromMillis(nowMs - graceMs);
  const activeStale = await db
    .collection(Collections.consultations)
    .where('status', '==', 'active')
    .where('lastTickAt', '<=', staleCutoff)
    .limit(SWEEP_LIMIT)
    .get();

  await forEachLimited(activeStale.docs, SWEEP_CONCURRENCY, (doc) =>
    db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      if (!snap.exists) return;
      const c = snap.data()!;
      if (c.status !== 'active') return; // may have ticked/ended since the query

      const lastTickMs = (c.lastTickAt as Timestamp | null)?.toMillis() ?? nowMs;
      // Bill only up to a short settle window past the last contact — never the
      // full silent gap. This is the fix for over-billing on disconnect.
      const billUntilMs = Math.min(nowMs, lastTickMs + STALE_BILL_SETTLE_MS);
      await applyTick(tx, doc.id, config, billUntilMs, 'reconnecting');

      // Force-pause for lost connection. applyTick only auto-pauses on balance
      // exhaustion; a disconnect must pause regardless. Reads are forbidden after
      // applyTick's writes, so we pause unconditionally — if applyTick already
      // paused on exhaustion this simply re-writes the same fields (idempotent).
      tx.update(doc.ref, {
        status: 'paused',
        pausedAt: Timestamp.fromMillis(billUntilMs),
        networkStatus: 'reconnecting',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }),
  );
}

// --- 2. Paused sessions past the session timeout → auto-end ---
export async function expirePaused(config: GlobalConfig, nowMs: number): Promise<void> {
  const pausedCutoff = Timestamp.fromMillis(nowMs - config.sessionTimeoutSec * 1000);
  const expired = await db
    .collection(Collections.consultations)
    .where('status', '==', 'paused')
    .where('pausedAt', '<=', pausedCutoff)
    .limit(SWEEP_LIMIT)
    .get();

  await forEachLimited(expired.docs, SWEEP_CONCURRENCY, (doc) =>
    db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      if (!snap.exists) return;
      const c = snap.data()!;
      if (c.status !== 'paused') return;

      // Use the per-astrologer commission snapshotted on the session at start —
      // NOT the current global config — so a session that ends via this sweep
      // pays the astrologer exactly what a manual "End" would (endConsultation
      // uses the same snapshot). Fall back to global only for legacy sessions.
      const commissionPercent =
        typeof c.commissionPercent === 'number' ? c.commissionPercent : config.commissionPercent;
      const net = astrologerNetEarning(c.totalCharged ?? 0, commissionPercent);
      tx.update(doc.ref, {
        status: 'expired',
        paymentStatus: 'settled',
        endTime: FieldValue.serverTimestamp(),
        duration: c.billedSeconds ?? 0,
        updatedAt: FieldValue.serverTimestamp(),
      });
      const astroRef = db.collection(Collections.astrologers).doc(c.astrologerId);
      const update: Record<string, unknown> = {
        totalConsultations: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      };
      // Release the exclusive lock only for a call — chats never held it.
      if (isCall(c.type)) update.available = true;
      tx.set(astroRef, update, { merge: true });
      // Earnings/pendingPayout live in private/financials, off the public doc.
      tx.set(
        astroRef.collection('private').doc('financials'),
        { earnings: FieldValue.increment(net), pendingPayout: FieldValue.increment(net), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      if (net > 0) {
        writeAstrologerLedger(tx, { astrologerId: c.astrologerId, kind: 'earning', amount: net, refId: doc.id, note: `${c.type} consultation earning (timed out)` });
      }
      // Mirror endConsultation's customer-side counters so a timed-out session
      // still counts and its billed time shows in the admin usage table (which
      // reads these denormalized fields instead of scanning consultations).
      tx.set(
        db.collection(Collections.users).doc(c.customerId),
        {
          totalConsultations: FieldValue.increment(1),
          usageSeconds: { [c.type as string]: FieldValue.increment(c.billedSeconds ?? 0) },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }),
  );
}

// --- 3. Waiting requests never accepted → expire and free the astrologer ---
// The session never started: NO billing, NO earnings credit, NOT counted.
async function expireWaiting(config: GlobalConfig, nowMs: number): Promise<void> {
  const waitingCutoff = Timestamp.fromMillis(nowMs - config.requestTimeoutSec * 1000);
  const staleWaiting = await db
    .collection(Collections.consultations)
    .where('status', '==', 'waiting')
    .where('createdAt', '<=', waitingCutoff)
    .limit(SWEEP_LIMIT)
    .get();

  await forEachLimited(staleWaiting.docs, SWEEP_CONCURRENCY, (doc) =>
    db.runTransaction(async (tx) => {
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
    }),
  );
}

// --- 5. Reconcile "ghost online" — presence heartbeat gone stale ---
// A human astrologer's app writes a `presence/{id}.lastSeen` heartbeat while
// online. If a crash / lost connection stops the heartbeat, `onlineStatus`
// would otherwise stay true forever and customers would send requests no one
// can accept. Any online human whose heartbeat is older than STALE_ONLINE_MS is
// forced offline (and freed). Presence lives OFF the public astrologer doc so
// the ~per-minute heartbeat never churns the directory customers are watching.
const STALE_ONLINE_MS = 3 * 60 * 1000;

async function reconcileStaleOnline(nowMs: number): Promise<void> {
  const online = await db
    .collection(Collections.astrologers)
    .where('onlineStatus', '==', true)
    .limit(SWEEP_LIMIT)
    .get();

  await forEachLimited(online.docs, SWEEP_CONCURRENCY, async (astro) => {
    if (astro.data().isAI === true) return; // AI personas are always available
    const pres = await db.collection('presence').doc(astro.id).get();
    const lastSeen = (pres.data()?.lastSeen as Timestamp | undefined)?.toMillis?.() ?? 0;
    if (nowMs - lastSeen > STALE_ONLINE_MS) {
      await astro.ref.set(
        { onlineStatus: false, available: true, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
  });
}

// --- 4. Reconcile orphaned availability flags ---
// `available == false` should mean "on or awaiting a voice/video call". Any
// human astrologer marked busy with no open CALL is a stuck flag — free them.
async function reconcileAvailability(): Promise<void> {
  const busy = await db
    .collection(Collections.astrologers)
    .where('available', '==', false)
    .limit(SWEEP_LIMIT)
    .get();

  await forEachLimited(busy.docs, SWEEP_CONCURRENCY, async (astro) => {
    if (astro.data().isAI === true) return;
    const open = await db
      .collection(Collections.consultations)
      .where('astrologerId', '==', astro.id)
      .where('status', 'in', OPEN_STATUSES)
      .limit(20)
      .get();
    if (open.docs.some((d) => isCall(d.data().type))) return; // genuinely on a call
    await astro.ref.set(
      { available: true, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  });
}
