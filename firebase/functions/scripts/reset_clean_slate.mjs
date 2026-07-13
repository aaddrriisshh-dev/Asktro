/**
 * PRE-LAUNCH CLEAN SLATE. Wipes all TEST/transactional data so real testing
 * shows clean results. Defaults to DRY-RUN (reports only). Pass --wipe to act.
 *
 *   cd firebase/functions
 *   GOOGLE_APPLICATION_CREDENTIALS=<key.json> node scripts/reset_clean_slate.mjs         # dry run
 *   GOOGLE_APPLICATION_CREDENTIALS=<key.json> node scripts/reset_clean_slate.mjs --wipe  # do it
 *
 * WHAT IT DOES (--wipe):
 *   • Deletes every CUSTOMER auth login (uids from the users collection).
 *   • Deletes all docs (and subcollections) in the transactional collections below.
 *   • Resets every astrologer: earnings/pendingPayout → 0, totalConsultations → 0,
 *     online→false; deletes their per-customer subcollections (keeps `private`,
 *     i.e. contact + reset financials).
 *
 * WHAT IT KEEPS: astrologers directory (51 AI + real), rechargePlans, coupons,
 *   banners, CMS/config, adminUsers, auditLogs, counters. NOTE: the single real
 *   ₹50 Razorpay test payment record is wiped too (money already moved; fine).
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'serviceAccountKey.json';
let svc;
try { svc = JSON.parse(readFileSync(keyPath, 'utf8')); }
catch { console.error(`\nCould not read ${keyPath}.\n`); process.exit(1); }
initializeApp({ credential: cert(svc) });
const db = getFirestore();
const auth = getAuth();

const EXECUTE = process.argv.includes('--wipe');

// Collections wiped entirely (docs + all their subcollections).
const WIPE = [
  'users', 'walletTransactions', 'consultations', 'astrologerLedger', 'payouts',
  'notifications', 'supportTickets', 'processedPayments', 'processedAdminOps',
  'rechargeOrders', 'couponRedemptions', 'dailyStats', 'kundliMatches', 'reports',
  'imageModeration', 'consentRecords', 'accountDeletions', 'failedWebhookCredits',
  'referrals', 'rateLimits', 'alerts', 'userBlocks', 'broadcasts',
];

async function count(name) {
  try { return (await db.collection(name).count().get()).data().count; }
  catch { return 0; }
}

async function run() {
  console.log(EXECUTE ? '\n*** WIPE MODE — deleting test data ***\n' : '\nDRY RUN — reporting only. Pass --wipe to delete.\n');

  // 1) Customer auth logins (uids come from the users collection).
  const userSnap = await db.collection('users').get();
  const uids = userSnap.docs.map((d) => d.id);
  console.log(`Customer auth logins to delete: ${uids.length}`);
  if (EXECUTE) {
    for (const uid of uids) { await auth.deleteUser(uid).catch(() => {}); }
    console.log('  ✓ auth logins deleted');
  }

  // 2) Wipe transactional collections.
  console.log('\nCollections:');
  for (const name of WIPE) {
    const n = await count(name);
    if (EXECUTE) { await db.recursiveDelete(db.collection(name)); console.log(`  ${name.padEnd(22)} wiped (${n})`); }
    else { console.log(`  ${name.padEnd(22)} ${n}`); }
  }

  // 3) Reset astrologers (keep the directory; zero money + counters; drop
  //    per-customer subcollections, keep `private`).
  const astros = await db.collection('astrologers').get();
  console.log(`\nAstrologers to reset: ${astros.size} (kept, zeroed)`);
  if (EXECUTE) {
    for (const a of astros.docs) {
      await a.ref.set({ totalConsultations: 0, onlineStatus: false, available: true }, { merge: true });
      await a.ref.collection('private').doc('financials').set({ earnings: 0, pendingPayout: 0 }, { merge: true });
      const subs = await a.ref.listCollections();
      for (const s of subs) { if (s.id !== 'private') await db.recursiveDelete(s); }
    }
    console.log('  ✓ astrologers zeroed, per-customer subcollections cleared');
  }

  console.log(EXECUTE ? '\n✓ Clean slate complete.\n' : '\n(Dry run — nothing changed.)\n');
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
