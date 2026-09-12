/**
 * Daily analytics rollup. The admin dashboard's revenue and consultation-
 * activity charts used to download whole ranges of the highest-volume
 * collections (walletTransactions, consultations) into the browser and
 * aggregate client-side — which OOMs the browser at scale. Instead, create-
 * triggers fold each new row into a per-UTC-day counter (`dailyStats/{day}`),
 * so the dashboard reads at most one small doc per day in the selected range
 * (≤ ~365 for a year) regardless of transaction volume.
 *
 * SHARDING (scalability): at 100k users the combined rate of signups +
 * recharges + consultation writes would all converge on the single current-day
 * doc and blow past Firestore's ~1 write/sec/document soft limit → transaction
 * contention and retries. So each fold now increments one of `SHARD_COUNT`
 * shard docs (`dailyStats/{day}/shards/{n}`) chosen at random — spreading the
 * write load ~SHARD_COUNT-fold. A light scheduled aggregator (`aggregateDay`,
 * every 2 min) sums the shards into the parent `dailyStats/{day}` doc that the
 * dashboard already reads UNCHANGED — so the read side and its query need no
 * change, and the dashboard just lags the very latest events by ≤ ~2 min.
 *
 * Backward compatibility: days written BEFORE sharding have their totals in the
 * parent doc and no shards; the aggregator captures those legacy totals once
 * (`_base`, guarded by `_baseCaptured`) and always writes parent = _base +
 * Σ shards, so no historical data is lost and the transition day stays correct.
 * Historical days (older than the aggregator's today/yesterday window) are never
 * touched. The dashboard ignores the extra `_base`/`_baseCaptured` fields.
 *
 * The docs carry SIGNED paise sums per ledger kind (recharge/bonus positive,
 * consultation/refund negative) plus per-kind counts, and per-type consultation
 * counts. Readers apply Math.abs where a magnitude is wanted.
 *
 * Idempotency: Eventarc delivery is AT-LEAST-once, so a create event can be
 * delivered more than once. Each fold is therefore guarded by a per-source-row
 * marker (`dailyStats/{day}/applied/{sourceId}`) written in the SAME transaction
 * as the shard increment — a redelivery finds the marker and no-ops, so counters
 * never double-count. (Analytics only; the authoritative ledger is separate.)
 *
 * Marker lifetime: redelivery only happens within Eventarc's bounded retry
 * window (≤ ~7 days), so a marker is dead weight after that. Each carries an
 * `expireAt` 30 days out; a Firestore TTL policy on the `applied` collection-
 * group's `expireAt` field then reaps them so the subcollection never grows
 * unbounded. Creating that TTL policy is a one-time console/gcloud step (the
 * write here is forward-compatible and harmless until it exists):
 *   gcloud firestore fields ttls update expireAt \
 *     --collection-group=applied --enable-ttl --project=asktro-tech-provate-limited
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { db, FieldValue, Timestamp } from '../common/admin';
import { Collections } from '../common/collections';

/** How many shard docs spread the per-day write load. Chosen so that even at the
 *  100k-user peak (~20 folds/sec into one day) each shard stays near Firestore's
 *  ~1 write/sec/doc soft limit. Tunable: raising it spreads writes further at the
 *  cost of a few more reads per aggregator run (negligible). */
const SHARD_COUNT = 20;

/** The nested numeric sub-objects a day's totals are composed of. */
const TOTAL_KEYS = ['revenue', 'counts', 'consultations', 'signups'] as const;
type Totals = Record<string, Record<string, number>>;

/** UTC day key (YYYY-MM-DD) + midnight-ms for a Firestore Timestamp. Matches the
 *  dashboard's existing `new Date(ms).toISOString().slice(0,10)` day bucketing. */
function dayBucket(ts: Timestamp | undefined): { day: string; dayMs: number } {
  const ms = ts?.toMillis?.() ?? Timestamp.now().toMillis();
  const day = new Date(ms).toISOString().slice(0, 10);
  const dayMs = Date.parse(`${day}T00:00:00.000Z`);
  return { day, dayMs };
}

function statsRef(day: string) {
  return db.collection(Collections.dailyStats).doc(day);
}

/** Sum the numeric leaves of `src` (under the known TOTAL_KEYS) into `acc`. */
function addInto(acc: Totals, src: Record<string, unknown> | undefined): void {
  if (!src) return;
  for (const k of TOTAL_KEYS) {
    const sub = src[k];
    if (!sub || typeof sub !== 'object') continue;
    acc[k] = acc[k] || {};
    for (const [f, v] of Object.entries(sub as Record<string, unknown>)) {
      if (typeof v === 'number') acc[k][f] = (acc[k][f] || 0) + v;
    }
  }
}

/** Run `increments` (nested FieldValue.increment sub-objects) into a RANDOM shard
 *  of `day`, exactly once per sourceId. The per-row marker guards against Eventarc
 *  at-least-once redelivery, written in the same transaction as the increment so a
 *  redelivery finds it and no-ops. Sharding removes single-doc write contention. */
async function foldOnce(
  sourceId: string,
  day: string,
  increments: Record<string, unknown>,
): Promise<void> {
  const dayRef = statsRef(day);
  const markerRef = dayRef.collection('applied').doc(sourceId);
  const shardRef = dayRef.collection('shards').doc(String(Math.floor(Math.random() * SHARD_COUNT)));
  // Dedupe markers only need to outlive Eventarc's redelivery window; 30 days is
  // far beyond it. A TTL policy on `applied.expireAt` reaps them (see file header).
  const expireAt = Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.runTransaction(async (tx) => {
    const marker = await tx.get(markerRef);
    if (marker.exists) return; // already folded this source row — no double count
    tx.set(shardRef, increments, { merge: true });
    tx.set(markerRef, { at: FieldValue.serverTimestamp(), expireAt });
  });
}

/**
 * Sum a day's shards into its parent `dailyStats/{day}` doc (the doc the
 * dashboard reads). Captures any pre-sharding legacy totals once as `_base`, then
 * always writes parent = _base + Σ shards. Idempotent and safe to run repeatedly.
 * Exported for unit/integration testing.
 */
export async function aggregateDay(day: string): Promise<void> {
  const dayRef = statsRef(day);
  const shardsSnap = await dayRef.collection('shards').get();
  if (shardsSnap.empty) return; // nothing sharded for this day yet — leave it be

  const shardTotals: Totals = {};
  for (const s of shardsSnap.docs) addInto(shardTotals, s.data());

  const parentSnap = await dayRef.get();
  const parent = parentSnap.data() ?? {};
  // Capture legacy (pre-sharding) totals exactly once, so the transition day and
  // any pre-existing day keep their already-counted values.
  let base: Totals = (parent._base as Totals) ?? {};
  if (!parent._baseCaptured) {
    base = {};
    addInto(base, parent); // whatever totals were direct-written before sharding
  }

  const merged: Totals = {};
  addInto(merged, base as unknown as Record<string, unknown>);
  addInto(merged, shardTotals as unknown as Record<string, unknown>);

  const dayMs = Date.parse(`${day}T00:00:00.000Z`);
  await dayRef.set(
    {
      day,
      dayMs,
      ...merged, // absolute totals (revenue/counts/consultations/signups)
      _base: base,
      _baseCaptured: true,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/** Fold one wallet-ledger row into its day's rollup. `sourceId` is the ledger
 *  doc id, used to dedupe redelivery. Extracted so it is unit-testable. */
export async function applyRevenueRollup(
  t: { kind?: string; amount?: number; createdAt?: Timestamp },
  sourceId: string,
): Promise<void> {
  const kind = t.kind;
  if (!kind) return;
  const amount = t.amount ?? 0;
  const { day } = dayBucket(t.createdAt);
  await foldOnce(sourceId, day, {
    revenue: { [kind]: FieldValue.increment(amount) },
    counts: { [kind]: FieldValue.increment(1) },
  });
}

/** Fold one consultation into its day's per-type session count. */
export async function applyConsultationRollup(
  c: { type?: string; createdAt?: Timestamp },
  sourceId: string,
): Promise<void> {
  const type = c.type;
  if (type !== 'chat' && type !== 'voice' && type !== 'video') return;
  const { day } = dayBucket(c.createdAt);
  await foldOnce(sourceId, day, {
    consultations: { [type]: FieldValue.increment(1) },
  });
}

/** Fold one new user signup into its day's counters (total + gender + withEmail),
 *  so the admin user cards never scan the whole users collection. Gender/email
 *  are captured at signup (fixed); lifetime states (paid/blocked) are read via
 *  server aggregations on the dashboard instead. */
export async function applyUserSignupRollup(
  u: { gender?: string; email?: unknown; createdAt?: Timestamp },
  sourceId: string,
): Promise<void> {
  const { day } = dayBucket(u.createdAt);
  const signups: Record<string, unknown> = { total: FieldValue.increment(1) };
  if (u.gender === 'male') signups.male = FieldValue.increment(1);
  else if (u.gender === 'female') signups.female = FieldValue.increment(1);
  if (u.email) signups.withEmail = FieldValue.increment(1);
  await foldOnce(sourceId, day, { signups });
}

// --- Signup rollup: count each new user into its day -------------------------
export const rollupUserSignup = onDocumentCreated('users/{id}', async (event) => {
  const u = event.data?.data();
  if (!u) return;
  try {
    await applyUserSignupRollup(u as { gender?: string; email?: unknown; createdAt?: Timestamp }, event.params.id);
  } catch (err) {
    logger.error('rollupUserSignup failed', { id: event.params.id, error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Revenue rollup: fold each new wallet-ledger row into its day ------------
export const rollupWalletTxn = onDocumentCreated('walletTransactions/{id}', async (event) => {
  const t = event.data?.data();
  if (!t) return;
  try {
    await applyRevenueRollup(t as { kind?: string; amount?: number; createdAt?: Timestamp }, event.params.id);
  } catch (err) {
    logger.error('rollupWalletTxn failed', { id: event.params.id, error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Consultation rollup: count each new session by type into its day --------
export const rollupConsultation = onDocumentCreated('consultations/{id}', async (event) => {
  const c = event.data?.data();
  if (!c) return;
  try {
    await applyConsultationRollup(c as { type?: string; createdAt?: Timestamp }, event.params.id);
  } catch (err) {
    logger.error('rollupConsultation failed', { id: event.params.id, error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Aggregator: sum each active day's shards into the doc the dashboard reads.
// Runs every 2 minutes over today + yesterday (UTC) so late-arriving events near
// midnight are captured. Historical days are stable and never re-touched. -----
export const aggregateDailyStats = onSchedule('every 2 minutes', async () => {
  const now = Date.now();
  const days = [
    new Date(now - 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // yesterday (UTC)
    new Date(now).toISOString().slice(0, 10), // today (UTC)
  ];
  for (const day of days) {
    try {
      await aggregateDay(day);
    } catch (err) {
      logger.error('aggregateDailyStats failed', { day, error: err instanceof Error ? err.message : String(err) });
    }
  }
});
