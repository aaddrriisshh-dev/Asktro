/**
 * Inspect the most recent VOICE/VIDEO consultations to see EXACTLY why a call
 * ended — status, the activate/end timestamps, endReason, billed seconds, pause
 * state and the last heartbeat times from each side. No guessing: this prints
 * the authoritative Firestore record.
 *
 * Run on the Mac (needs the Google key):
 *   GOOGLE_APPLICATION_CREDENTIALS="$HOME/Projects/Asktro/firebase/functions/serviceAccountKey.json" \
 *     node scripts/inspectRecentCalls.js
 */
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const fmt = (v) => (v && v.toDate ? v.toDate().toISOString() : v);

(async () => {
  // Pull recent consultations by time, then keep the voice/video ones — avoids
  // needing a composite index on (type, createdAt).
  const snap = await db.collection('consultations').orderBy('createdAt', 'desc').limit(30).get();
  const calls = snap.docs.filter((d) => ['voice', 'video'].includes(d.data().type)).slice(0, 6);

  if (calls.length === 0) {
    console.log('No voice/video consultations found in the last 30.');
    process.exit(0);
  }

  for (const doc of calls) {
    const d = doc.data();
    console.log(`\n===== ${d.type} consultation ${doc.id} =====`);
    for (const [k, v] of Object.entries(d)) {
      console.log(`  ${k}: ${fmt(v)}`);
    }
    // Handy derived timing if the timestamps exist.
    const start = d.startTime?.toDate?.() || d.activatedAt?.toDate?.() || d.createdAt?.toDate?.();
    const end = d.endTime?.toDate?.() || d.pausedAt?.toDate?.();
    if (start && end) {
      console.log(`  >> lived ~${Math.round((end - start) / 1000)}s (start→end)`);
    }
  }
  process.exit(0);
})().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
