/**
 * Daily analytics rollup. The admin dashboard's revenue and consultation-
 * activity charts used to download whole ranges of the highest-volume
 * collections (walletTransactions, consultations) into the browser and
 * aggregate client-side — which OOMs the browser at scale. Instead, two
 * create-triggers fold each new row into a per-UTC-day counter doc
 * (`dailyStats/{YYYY-MM-DD}`), so the dashboard reads at most one small doc per
 * day in the selected range (≤ ~365 for a year) regardless of transaction
 * volume.
 *
 * The docs carry SIGNED paise sums per ledger kind (recharge/bonus positive,
 * consultation/refund negative) plus per-kind counts, and per-type consultation
 * counts. Readers apply Math.abs where a magnitude is wanted.
 *
 * Idempotency: Eventarc delivery is AT-LEAST-once, so a create event can be
 * delivered more than once. Each fold is therefore guarded by a per-source-row
 * marker (`dailyStats/{day}/applied/{sourceId}`) written in the SAME transaction
 * as the increment — a redelivery finds the marker and no-ops, so counters never
 * double-count. (Analytics only; the authoritative ledger is separate.)
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
import { logger } from 'firebase-functions/v2';
import { db, FieldValue, Timestamp } from '../common/admin';
import { Collections } from '../common/collections';

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

/** Run `fold` (which computes the day + the increment fields) exactly once per
 *  sourceId, guarding against at-least-once redelivery with a per-row marker in
 *  the same transaction as the increment. */
async function foldOnce(
  sourceId: string,
  day: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const dayRef = statsRef(day);
  const markerRef = dayRef.collection('applied').doc(sourceId);
  // Dedupe markers only need to outlive Eventarc's redelivery window; 30 days is
  // far beyond it. A TTL policy on `applied.expireAt` reaps them (see file header).
  const expireAt = Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.runTransaction(async (tx) => {
    const marker = await tx.get(markerRef);
    if (marker.exists) return; // already folded this source row — no double count
    tx.set(dayRef, fields, { merge: true });
    tx.set(markerRef, { at: FieldValue.serverTimestamp(), expireAt });
  });
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
  const { day, dayMs } = dayBucket(t.createdAt);
  await foldOnce(sourceId, day, {
    day,
    dayMs,
    revenue: { [kind]: FieldValue.increment(amount) },
    counts: { [kind]: FieldValue.increment(1) },
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Fold one consultation into its day's per-type session count. */
export async function applyConsultationRollup(
  c: { type?: string; createdAt?: Timestamp },
  sourceId: string,
): Promise<void> {
  const type = c.type;
  if (type !== 'chat' && type !== 'voice' && type !== 'video') return;
  const { day, dayMs } = dayBucket(c.createdAt);
  await foldOnce(sourceId, day, {
    day,
    dayMs,
    consultations: { [type]: FieldValue.increment(1) },
    updatedAt: FieldValue.serverTimestamp(),
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
  const { day, dayMs } = dayBucket(u.createdAt);
  const signups: Record<string, unknown> = { total: FieldValue.increment(1) };
  if (u.gender === 'male') signups.male = FieldValue.increment(1);
  else if (u.gender === 'female') signups.female = FieldValue.increment(1);
  if (u.email) signups.withEmail = FieldValue.increment(1);
  await foldOnce(sourceId, day, { day, dayMs, signups, updatedAt: FieldValue.serverTimestamp() });
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
