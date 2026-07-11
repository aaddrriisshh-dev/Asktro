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
 * counts. Readers apply Math.abs where a magnitude is wanted. Increments are
 * idempotent per source row because each create fires the trigger exactly once.
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

/** Fold one wallet-ledger row into its day's rollup. Extracted from the trigger
 *  so it is unit-testable against the emulator. */
export async function applyRevenueRollup(t: { kind?: string; amount?: number; createdAt?: Timestamp }): Promise<void> {
  const kind = t.kind;
  if (!kind) return;
  const amount = t.amount ?? 0;
  const { day, dayMs } = dayBucket(t.createdAt);
  await statsRef(day).set(
    {
      day,
      dayMs,
      revenue: { [kind]: FieldValue.increment(amount) },
      counts: { [kind]: FieldValue.increment(1) },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/** Fold one consultation into its day's per-type session count. */
export async function applyConsultationRollup(c: { type?: string; createdAt?: Timestamp }): Promise<void> {
  const type = c.type;
  if (type !== 'chat' && type !== 'voice' && type !== 'video') return;
  const { day, dayMs } = dayBucket(c.createdAt);
  await statsRef(day).set(
    {
      day,
      dayMs,
      consultations: { [type]: FieldValue.increment(1) },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

// --- Revenue rollup: fold each new wallet-ledger row into its day ------------
export const rollupWalletTxn = onDocumentCreated('walletTransactions/{id}', async (event) => {
  const t = event.data?.data();
  if (!t) return;
  try {
    await applyRevenueRollup(t as { kind?: string; amount?: number; createdAt?: Timestamp });
  } catch (err) {
    logger.error('rollupWalletTxn failed', { id: event.params.id, error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Consultation rollup: count each new session by type into its day --------
export const rollupConsultation = onDocumentCreated('consultations/{id}', async (event) => {
  const c = event.data?.data();
  if (!c) return;
  try {
    await applyConsultationRollup(c as { type?: string; createdAt?: Timestamp });
  } catch (err) {
    logger.error('rollupConsultation failed', { id: event.params.id, error: err instanceof Error ? err.message : String(err) });
  }
});
