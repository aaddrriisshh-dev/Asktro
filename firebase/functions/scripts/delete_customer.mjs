/**
 * Fully delete ONE customer so a fresh signup runs the real onUserCreate path
 * (welcome free-minutes bonus, zero wallet). Removes:
 *   - the Firebase Auth account   (so re-signup is a genuine create, not a login)
 *   - the users/{uid} profile doc
 *   - their walletTransactions
 *   - consultations where they are the customer (+ messages/typing subcollections)
 *   - their notifications
 *
 * Identify by ONE of --uid / --phone / --email.
 *
 *   node scripts/delete_customer.mjs --email you@gmail.com
 *   node scripts/delete_customer.mjs --phone +919999999999
 *
 * Prints what it found and requires --yes to actually delete.
 * Run from firebase/functions (needs serviceAccountKey.json).
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}
const uidArg = arg('--uid');
const phone = arg('--phone');
const email = arg('--email');
const YES = process.argv.includes('--yes');

if (!uidArg && !phone && !email) {
  console.error('\nUsage: node scripts/delete_customer.mjs (--uid <id> | --phone <+..> | --email <..>) --yes\n');
  process.exit(1);
}
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1); };

async function resolveUid() {
  if (uidArg) return uidArg;
  // Try Firebase Auth lookup first (authoritative), then the users collection.
  try {
    if (phone) return (await auth.getUserByPhoneNumber(phone)).uid;
    if (email) return (await auth.getUserByEmail(email)).uid;
  } catch {
    // fall through to Firestore lookup
  }
  const field = phone ? 'phone' : 'email';
  const value = phone || email;
  const snap = await db.collection('users').where(field, '==', value).limit(2).get();
  if (snap.empty) fail(`No account found with ${field} == ${value}`);
  if (snap.size > 1) fail(`Multiple users match ${field} == ${value}; pass --uid`);
  return snap.docs[0].id;
}

async function deleteQuery(q) {
  const snap = await q.get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
  return snap.size;
}

async function run() {
  const uid = await resolveUid();
  const profile = (await db.collection('users').doc(uid).get()).data();
  console.log(`\nTarget account: ${uid}`);
  console.log(`  name: ${profile?.name ?? '—'}  phone: ${profile?.phone ?? '—'}  email: ${profile?.email ?? '—'}`);

  if (!YES) {
    console.log(`\nDry run. Re-run with --yes to permanently delete this account and its data.\n`);
    process.exit(0);
  }

  // consultations where this user is the customer (+ their subcollections)
  const cons = await db.collection('consultations').where('customerId', '==', uid).get();
  for (const c of cons.docs) {
    await deleteQuery(c.ref.collection('messages'));
    await deleteQuery(c.ref.collection('typing'));
    await c.ref.delete();
  }
  const txns = await deleteQuery(db.collection('walletTransactions').where('userId', '==', uid));
  const notifs = await deleteQuery(db.collection('notifications').where('userId', '==', uid));
  await db.collection('users').doc(uid).delete();
  try {
    await auth.deleteUser(uid);
  } catch (e) {
    console.log(`  (auth user already absent: ${e.code || e.message})`);
  }

  console.log(`\n✓ Deleted account ${uid}`);
  console.log(`  consultations: ${cons.size}   walletTransactions: ${txns}   notifications: ${notifs}`);
  console.log(`  Auth + profile removed. Sign up fresh in the app to get the welcome free minutes.\n`);
  process.exit(0);
}

run().catch((e) => fail(e.stack || String(e)));
