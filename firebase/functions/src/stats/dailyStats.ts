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
  await db.runTransaction(async (tx) => {
    const marker = await tx.get(markerRef);
    if (marker.exists) return; // already folded this source row — no double count
    tx.set(dayRef, fields, { merge: true });
    tx.set(markerRef, { at: FieldValue.serverTimestamp() });
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
