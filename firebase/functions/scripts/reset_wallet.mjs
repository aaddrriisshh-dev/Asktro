/**
 * Reset ONE customer back to a fresh "free user" state so the free-minutes
 * countdown can be tested:
 *   - deletes their walletTransactions (wallet history)
 *   - zeroes walletBalance / lockedBalance / pendingRefund / totalRecharge /
 *     totalSpent  (so the app treats them as never-paid → shows the countdown)
 *   - grants `--minutes` of free credit as bonusBalance at `--rate` ₹/min
 *     (default 3 minutes @ ₹25/min = ₹75) so a session can start and tick down
 *
 * Identify the user by ONE of --uid / --phone / --email.
 *
 *   node scripts/reset_wallet.mjs --email you@gmail.com
 *   node scripts/reset_wallet.mjs --phone +919999999999
 *   node scripts/reset_wallet.mjs --uid <firebase-uid> --minutes 3 --rate 25
 *
 * Run from firebase/functions (needs serviceAccountKey.json).
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
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

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const uidArg = arg('--uid');
const phone = arg('--phone');
const email = arg('--email');
const minutes = Number(arg('--minutes', '3'));
const rate = Number(arg('--rate', '25')); // ₹ per minute

if (!uidArg && !phone && !email) {
  console.error('\nUsage: node scripts/reset_wallet.mjs (--uid <id> | --phone <+..> | --email <..>) [--minutes 3] [--rate 25]\n');
  process.exit(1);
}

async function findUserRef() {
  if (uidArg) {
    const ref = db.collection('users').doc(uidArg);
    const snap = await ref.get();
    if (!snap.exists) fail(`No user doc with uid ${uidArg}`);
    return ref;
  }
  const field = phone ? 'phone' : 'email';
  const value = phone || email;
  const snap = await db.collection('users').where(field, '==', value).limit(2).get();
  if (snap.empty) fail(`No user found with ${field} == ${value}`);
  if (snap.size > 1) fail(`Multiple users match ${field} == ${value}; pass --uid instead`);
  return snap.docs[0].ref;
}

function fail(msg) {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

async function run() {
  const ref = await findUserRef();
  const uid = ref.id;
  const bonusPaise = Math.round(minutes * rate * 100);

  // 1) delete wallet history
  const txns = await db.collection('walletTransactions').where('userId', '==', uid).get();
  let deleted = 0;
  for (let i = 0; i < txns.docs.length; i += 400) {
    const batch = db.batch();
    for (const d of txns.docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
    deleted += Math.min(400, txns.docs.length - i);
  }

  // 2) reset money fields → fresh free user with N free minutes of bonus credit
  await ref.set(
    {
      walletBalance: 0,
      lockedBalance: 0,
      pendingRefund: 0,
      totalRecharge: 0,
      totalSpent: 0,
      bonusBalance: bonusPaise,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const before = (await ref.get()).data();
  console.log(`\n✓ Reset ${uid}`);
  console.log(`  deleted ${deleted} wallet transaction(s)`);
  console.log(`  walletBalance = ₹0  (app now treats you as a free user → countdown shows)`);
  console.log(`  bonusBalance  = ₹${(bonusPaise / 100).toFixed(0)}  (~${minutes} free min @ ₹${rate}/min)`);
  console.log(`  name: ${before?.name ?? '—'}   phone: ${before?.phone ?? '—'}   email: ${before?.email ?? '—'}\n`);
  process.exit(0);
}

run().catch((e) => fail(e.stack || String(e)));
