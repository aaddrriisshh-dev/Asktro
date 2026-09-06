/**
 * Print the LIVE config/global money rules so we can VERIFY them before the paid
 * launch (no guessing). Read-only — changes nothing.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS="$HOME/Projects/Asktro/firebase/functions/serviceAccountKey.json" \
 *     node scripts/dumpConfig.js
 */
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const WANT = [
  'minWalletToStartPaise',   // expect 1800 (₹18 min to start a HUMAN consult)
  'freeChatMinutes',         // expect small (e.g. 3) or 0 — NOT 999999 (that leaks money)
  'devPaymentsEnabled',      // expect false/absent in production
  'aiEnabled',               // expect true/absent (AI on)
  'aiDailyMessageCap',       // 0/absent = unlimited
  'consultationPricePerMinutePaise', // base human rate
  'commissionPercent',
  'graceMinutes',
  'warnLevel1Sec',
  'warnLevel2Sec',
];

(async () => {
  const snap = await db.collection('config').doc('global').get();
  if (!snap.exists) { console.log('config/global does NOT exist.'); process.exit(0); }
  const d = snap.data() || {};
  console.log('=== config/global — key money rules ===');
  for (const k of WANT) {
    console.log(`  ${k}: ${k in d ? JSON.stringify(d[k]) : '(absent)'}`);
  }
  console.log('\n=== full config/global ===');
  console.log(JSON.stringify(d, null, 2));
  process.exit(0);
})().catch((e) => { console.error('Failed:', e); process.exit(1); });
