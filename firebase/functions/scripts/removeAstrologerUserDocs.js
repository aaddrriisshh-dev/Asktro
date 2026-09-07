/**
 * One-off cleanup: remove CUSTOMER profiles (`users/{uid}`) that were auto-minted
 * for ASTROLOGERS. Astrologers are a separate category — they live in the
 * `astrologers` collection (profile, payouts, online status) and must not appear
 * in the customer "users" list or inflate customer counts.
 *
 * An astrologer's auth uid == their `astrologers/{uid}` doc id, so we simply
 * delete any `users/{uid}` whose uid is an astrologer id.
 *
 * SAFETY: verified nothing depends on an astrologer having a users doc — the
 * astrologer app never reads `users`, and no function joins astrologer→users.
 * Deleting only removes the stray customer profile; the astrologer's own record,
 * earnings and payouts (in `astrologers/{uid}`) are untouched.
 *
 * DRY-RUN by default (lists what it would delete). Pass --delete to apply.
 *
 * Run on the Mac (needs the Google service-account key), from firebase/functions:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS="$HOME/Projects/Asktro/firebase/functions/serviceAccountKey.json" \
 *     node scripts/removeAstrologerUserDocs.js            # dry run (list)
 *   GOOGLE_APPLICATION_CREDENTIALS="$HOME/Projects/Asktro/firebase/functions/serviceAccountKey.json" \
 *     node scripts/removeAstrologerUserDocs.js --delete    # actually delete
 */
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const APPLY = process.argv.includes('--delete');

(async () => {
  const astros = await db.collection('astrologers').get();
  if (astros.empty) {
    console.log('No astrologers found. Nothing to do.');
    process.exit(0);
  }

  console.log(`Checking ${astros.size} astrologer(s) for a stray customer profile…\n`);
  let found = 0;
  let removed = 0;

  for (const a of astros.docs) {
    const uid = a.id;
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) continue;

    found += 1;
    const u = userSnap.data() || {};
    const name = u.name || '(no name)';
    const phone = u.phone || '';
    console.log(`- astrologer ${uid} HAS a users doc: name="${name}" phone="${phone}"`);

    if (APPLY) {
      await userRef.delete();
      console.log('   -> DELETED users doc');
      removed += 1;
    }
  }

  console.log('');
  if (!APPLY) {
    console.log(`DRY RUN. Found ${found} astrologer(s) with a stray customer profile.`);
    console.log('Re-run with --delete to remove them.');
  } else {
    console.log(`Done. Removed ${removed} of ${found} stray customer profile(s).`);
    console.log('Astrologer records, earnings and payouts are untouched.');
  }
  process.exit(0);
})().catch((e) => {
  console.error('Cleanup failed:', e);
  process.exit(1);
});
