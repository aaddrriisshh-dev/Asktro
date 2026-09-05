/**
 * Remove the fake/demo HUMAN astrologer seeds before the paid launch.
 *
 * Deletes every astrologer doc where isAI !== true (i.e. the human seeds like
 * "Zodia Demo Astro", "Guruji Mullick", etc.). The AI personas (isAI === true —
 * your "New Astrologers") are left completely untouched.
 *
 * Run once with --list first to preview, then again with --delete to remove:
 *   node scripts/deleteSeedHumanAstrologers.js --list
 *   node scripts/deleteSeedHumanAstrologers.js --delete
 * (needs GOOGLE_APPLICATION_CREDENTIALS as usual)
 */
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const doDelete = process.argv.includes('--delete');

(async () => {
  const snap = await db.collection('astrologers').get();
  const humans = snap.docs.filter((d) => d.data().isAI !== true);
  const ai = snap.docs.length - humans.length;

  console.log(`Total astrologers: ${snap.docs.length}  |  AI (kept): ${ai}  |  human (to remove): ${humans.length}\n`);
  humans.forEach((d) => console.log(`  - ${d.data().name || '(no name)'}  [${d.id}]`));

  if (!doDelete) {
    console.log('\nPreview only. Re-run with  --delete  to actually remove these human seeds.');
    process.exit(0);
  }

  let n = 0;
  let batch = db.batch();
  for (const d of humans) {
    batch.delete(d.ref);
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (n % 400 !== 0) await batch.commit();
  console.log(`\nDeleted ${n} human astrologer(s). AI personas untouched. Add your real astrologers from the portal now.`);
  process.exit(0);
})().catch((e) => { console.error('Failed:', e); process.exit(1); });
