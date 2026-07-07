/**
 * Dev-only wallet top-up so the consultation flow can be tested without a live
 * payment gateway. Credits real (paid) wallet balance to a user by phone/uid.
 *
 *   node scripts/topup_wallet.mjs --phone +919650589905            # +₹500 default
 *   node scripts/topup_wallet.mjs --phone +91... --rupees 1000
 *
 * Run from firebase/functions (needs serviceAccountKey.json).
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'serviceAccountKey.json';
let svc;
try {
  svc = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch {
  console.error(`\nCould not read ${keyPath}. Run from firebase/functions with a service-account key.\n`);
  process.exit(1);
}
initializeApp({ credential: cert(svc) });
const db = getFirestore();
const auth = getAuth();

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const uidArg = arg('--uid');
const phone = arg('--phone');
const rupees = Number(arg('--rupees', '500'));

if (!uidArg && !phone) {
  console.error('\nUsage: node scripts/topup_wallet.mjs (--uid <id> | --phone <+..>) [--rupees 500]\n');
  process.exit(1);
}

async function run() {
  let uid = uidArg;
  if (!uid) uid = (await auth.getUserByPhoneNumber(phone)).uid;

  const paise = Math.round(rupees * 100);
  const ref = db.collection('users').doc(uid);
  const before = (await ref.get()).data();
  if (!before) {
    console.error(`\nNo users/${uid} profile. Sign in on the app first, then re-run.\n`);
    process.exit(1);
  }

  await ref.set(
    {
      walletBalance: FieldValue.increment(paise),
      totalRecharge: FieldValue.increment(paise),
      ...(before.firstRechargeAt ? {} : { firstRechargeAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // Ledger entry so it shows in wallet history like a real recharge.
  await db.collection('walletTransactions').add({
    userId: uid,
    kind: 'recharge',
    amount: paise,
    balanceBefore: (before.walletBalance ?? 0) + (before.bonusBalance ?? 0),
    balanceAfter: (before.walletBalance ?? 0) + (before.bonusBalance ?? 0) + paise,
    refId: 'dev_topup',
    note: 'Dev top-up (no gateway)',
    createdAt: FieldValue.serverTimestamp(),
  });

  const after = (await ref.get()).data();
  console.log(`\n✓ Topped up ${uid}`);
  console.log(`  +₹${rupees}   new wallet balance: ₹${((after.walletBalance ?? 0) / 100).toFixed(0)}`);
  console.log(`  name: ${after.name ?? '—'}   phone: ${after.phone ?? '—'}\n`);
  process.exit(0);
}

run().catch((e) => {
  console.error('\n' + (e.message || String(e)) + '\n');
  process.exit(1);
});
