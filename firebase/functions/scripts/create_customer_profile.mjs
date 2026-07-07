/**
 * Create a customer profile document for an existing Auth user, in case the
 * app's client-side profile write never reached the server. Gives them a clean
 * profile + free-minute bonus so they can use the app immediately.
 *
 *   node scripts/create_customer_profile.mjs --phone +919650589905
 *   node scripts/create_customer_profile.mjs --phone +91... --name "Adrish" --minutes 3 --rate 25
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
const name = arg('--name', 'You');
const minutes = Number(arg('--minutes', '3'));
const rate = Number(arg('--rate', '25')); // ₹/min

if (!uidArg && !phone) {
  console.error('\nUsage: node scripts/create_customer_profile.mjs (--uid <id> | --phone <+..>) [--name X] [--minutes 3] [--rate 25]\n');
  process.exit(1);
}

function referralCode(uid) {
  const base = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `ASK${base.slice(-4).padStart(4, 'X')}`;
}

async function run() {
  let uid = uidArg;
  let authPhone = phone;
  if (!uid) {
    const u = await auth.getUserByPhoneNumber(phone);
    uid = u.uid;
    authPhone = u.phoneNumber || phone;
  }

  const bonus = Math.round(minutes * rate * 100);
  const ref = db.collection('users').doc(uid);
  const existing = await ref.get();

  await ref.set(
    {
      name,
      phone: authPhone,
      walletBalance: 0,
      bonusBalance: bonus,
      lockedBalance: 0,
      totalRecharge: 0,
      totalSpent: 0,
      totalConsultations: 0,
      pendingRefund: 0,
      accountStatus: 'active',
      notificationEnabled: true,
      signupBonusGranted: true,
      referralCode: referralCode(uid),
      createdAt: existing.exists ? existing.data().createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  console.log(`\n✓ Profile ${existing.exists ? 'updated' : 'created'} for ${uid}`);
  console.log(`  phone: ${authPhone}   name: ${name}`);
  console.log(`  bonusBalance: ₹${(bonus / 100).toFixed(0)} (~${minutes} free min @ ₹${rate}/min)\n`);
  process.exit(0);
}

run().catch((e) => {
  console.error('\n' + (e.message || String(e)) + '\n');
  process.exit(1);
});
