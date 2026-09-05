/**
 * One-off cleanup: close "ghost" consultations that are stuck in `active` or
 * `paused` and are inflating the admin dashboard's "Active Consultations" card.
 *
 * These are sessions that started (often during testing) but whose end/tick
 * write never landed, so they sit open forever. The 1-minute sweeper can miss
 * an `active` doc that has no `lastTickAt` (its query filters on that field), so
 * such a doc never self-clears. This script closes them safely.
 *
 * SAFETY: it only closes sessions whose last activity is older than 30 minutes,
 * so a genuinely live chat happening right now is left untouched. Nothing is
 * billed (v1 is free) — it just sets status -> expired so the card reflects
 * reality.
 *
 * Run on the Mac (needs the Google service-account key), from firebase/functions:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS="$HOME/Projects/Asktro/firebase/functions/serviceAccountKey.json" \
 *     node scripts/closeStaleConsultations.js
 */
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const STALE_MS = 30 * 60 * 1000; // 30 minutes

const toMs = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0);

(async () => {
  const snap = await db
    .collection('consultations')
    .where('status', 'in', ['active', 'paused'])
    .get();

  if (snap.empty) {
    console.log('No active/paused consultations found. Nothing to clear. ✅');
    process.exit(0);
  }

  const now = Date.now();
  let closed = 0;
  let skipped = 0;

  console.log(`Found ${snap.size} open consultation(s):\n`);
  for (const doc of snap.docs) {
    const c = doc.data();
    const lastMs = toMs(c.lastTickAt) || toMs(c.pausedAt) || toMs(c.createdAt);
    const ageMin = lastMs ? Math.round((now - lastMs) / 60000) : '?';
    const customer = (c.customerId || '').toString().slice(0, 10);
    console.log(
      `- ${doc.id} | status=${c.status} type=${c.type || '?'} customer=${customer} ` +
        `lastActivity=${ageMin}min ago charged=${c.totalCharged || 0}`,
    );

    if (lastMs && now - lastMs < STALE_MS) {
      console.log('   -> SKIP (active within last 30 min — could be a real live session)');
      skipped += 1;
      continue;
    }

    await doc.ref.update({
      status: 'expired',
      paymentStatus: 'settled',
      endTime: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('   -> CLOSED (status = expired)');
    closed += 1;
  }

  console.log(`\nDone. Closed ${closed}, skipped ${skipped}.`);
  console.log('Refresh the admin dashboard — "Active Consultations" should now reflect reality.');
  process.exit(0);
})().catch((e) => {
  console.error('Cleanup failed:', e);
  process.exit(1);
});
