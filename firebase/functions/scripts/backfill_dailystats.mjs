/**
 * One-time backfill for the daily-stats rollup (`dailyStats/{India-day}`).
 *
 * The rollup triggers (rollupWalletTxn/Consultation/UserSignup) only fold rows
 * created AFTER they were deployed, so the dashboard's Revenue-trend /
 * Consultation-activity / sign-up charts are blank for everything that happened
 * before deploy. This script reads the existing walletTransactions, consultations
 * and users and writes each INDIA-day's summary doc directly, so the charts show
 * history immediately.
 *
 *   node scripts/backfill_dailystats.mjs         # dry run — prints per-day totals
 *   node scripts/backfill_dailystats.mjs --yes   # write the summary docs
 *
 * Run from firebase/functions with GOOGLE_APPLICATION_CREDENTIALS (the Google
 * JSON) exported, same as the deploy. Safe to re-run: it recomputes from the raw
 * ledgers and overwrites, and clears each day's live shards so a backfilled row
 * is never double-counted by the every-2-min aggregator.
 *
 * India-day bucketing matches functions/src/stats/dailyStats.ts exactly:
 *   day   = India calendar date (YYYY-MM-DD in IST)
 *   dayMs = the real UTC instant of that India day's midnight (IST midnight)
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'serviceAccountKey.json';
let svc;
try {
  svc = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch {
  console.error(`\nCould not read ${keyPath}. Run from firebase/functions with the service-account key.\n`);
  process.exit(1);
}
initializeApp({ credential: cert(svc) });
const db = getFirestore();
const YES = process.argv.includes('--yes');
const IST = 5.5 * 60 * 60 * 1000;

/** India-day bucket for a Firestore Timestamp — mirrors the live rollup. */
function bucket(ts) {
  const ms = ts?.toMillis?.() ?? null;
  if (ms == null) return null;
  const s = new Date(ms + IST);
  const day = s.toISOString().slice(0, 10);
  const dayMs = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) - IST;
  return { day, dayMs };
}

const days = {}; // day -> { dayMs, revenue:{}, counts:{}, consultations:{}, signups:{} }
const ensure = (day, dayMs) => (days[day] ??= { dayMs, revenue: {}, counts: {}, consultations: {}, signups: {} });
const inc = (obj, k, n = 1) => { obj[k] = (obj[k] || 0) + n; };

const run = async () => {
  // Revenue + counts by ledger kind (amount is signed paise).
  const wt = await db.collection('walletTransactions').get();
  for (const d of wt.docs) {
    const t = d.data();
    const b = bucket(t.createdAt);
    if (!b || !t.kind) continue;
    const day = ensure(b.day, b.dayMs);
    inc(day.revenue, t.kind, Number(t.amount) || 0);
    inc(day.counts, t.kind, 1);
  }

  // Consultation activity by type.
  const cs = await db.collection('consultations').get();
  for (const d of cs.docs) {
    const c = d.data();
    const b = bucket(c.createdAt);
    if (!b || !['chat', 'voice', 'video'].includes(c.type)) continue;
    inc(ensure(b.day, b.dayMs).consultations, c.type, 1);
  }

  // Signups (total + gender + with-email).
  const us = await db.collection('users').get();
  for (const d of us.docs) {
    const u = d.data();
    const b = bucket(u.createdAt);
    if (!b) continue;
    const day = ensure(b.day, b.dayMs);
    inc(day.signups, 'total', 1);
    if (u.gender === 'male') inc(day.signups, 'male', 1);
    else if (u.gender === 'female') inc(day.signups, 'female', 1);
    if (u.email) inc(day.signups, 'withEmail', 1);
  }

  const sorted = Object.keys(days).sort();
  console.log(`\nComputed ${sorted.length} India-day(s) from ${wt.size} txns, ${cs.size} consults, ${us.size} users:\n`);
  for (const day of sorted) {
    const t = days[day];
    const rev = Object.values(t.revenue).reduce((a, b) => a + b, 0);
    console.log(`  ${day}  revenue ₹${(rev / 100).toFixed(2)}  counts ${JSON.stringify(t.counts)}  consults ${JSON.stringify(t.consultations)}  signups ${JSON.stringify(t.signups)}`);
  }

  if (!YES) {
    console.log('\nDry run — nothing written. Re-run with --yes to write the summary docs.\n');
    process.exit(0);
  }

  for (const day of sorted) {
    const t = days[day];
    const ref = db.collection('dailyStats').doc(day);
    // Clear any live shards for this day so backfilled rows are never double-
    // counted by the aggregator (parent = _base + Σ shards). Pre-deploy days have
    // none; today/yesterday may have a few from post-deploy events.
    const shards = await ref.collection('shards').get();
    if (!shards.empty) {
      const batch = db.batch();
      for (const s of shards.docs) batch.delete(s.ref);
      await batch.commit();
    }
    const totals = { revenue: t.revenue, counts: t.counts, consultations: t.consultations, signups: t.signups };
    await ref.set(
      { day, dayMs: t.dayMs, ...totals, _base: totals, _baseCaptured: true, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  console.log(`\nBackfill written ✓  (${sorted.length} day docs)\n`);
  process.exit(0);
};

run().catch((e) => { console.error(e); process.exit(1); });
