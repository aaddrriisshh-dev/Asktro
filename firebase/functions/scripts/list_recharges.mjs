/**
 * List every recharge ledger entry (walletTransactions, kind == 'recharge') so
 * real Razorpay payments can be told apart from dev/test top-ups.
 *
 *   node scripts/list_recharges.mjs
 *
 * Run from firebase/functions (needs serviceAccountKey.json or
 * GOOGLE_APPLICATION_CREDENTIALS). READ-ONLY — changes nothing.
 *
 * A TEST recharge (dummy gateway) has refId starting "dev_" (note "Test
 * recharge (dummy gateway)"). A REAL recharge has a Razorpay id in refId.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'serviceAccountKey.json';
let svc;
try { svc = JSON.parse(readFileSync(keyPath, 'utf8')); }
catch { console.error(`\nCould not read ${keyPath}. Run from firebase/functions with a service-account key.\n`); process.exit(1); }
initializeApp({ credential: cert(svc) });
const db = getFirestore();

const rupees = (p) => `₹${((p ?? 0) / 100).toFixed(2)}`;

const run = async () => {
  const snap = await db.collection('walletTransactions').where('kind', '==', 'recharge').get();
  if (snap.empty) { console.log('No recharge transactions found.'); return; }

  const rows = snap.docs.map((d) => {
    const x = d.data();
    const refId = String(x.refId ?? '');
    return {
      when: x.createdAt?.toDate ? x.createdAt.toDate().toISOString().slice(0, 16).replace('T', ' ') : '—',
      amount: (x.amount ?? 0),
      refId,
      isTest: refId.startsWith('dev_') || /dummy|test/i.test(String(x.note ?? '')),
      userId: String(x.userId ?? '—'),
    };
  }).sort((a, b) => a.when.localeCompare(b.when));

  let realSum = 0, testSum = 0, realN = 0, testN = 0;
  console.log(`\nFound ${rows.length} recharge transaction(s):\n`);
  for (const r of rows) {
    const tag = r.isTest ? 'TEST' : 'REAL';
    if (r.isTest) { testSum += r.amount; testN++; } else { realSum += r.amount; realN++; }
    console.log(`[${tag}] ${r.when}  ${rupees(r.amount).padStart(9)}  ref=${r.refId || '—'}  user=${r.userId}`);
  }
  console.log(`\n— REAL:  ${realN} recharge(s) = ${rupees(realSum)}`);
  console.log(`— TEST:  ${testN} recharge(s) = ${rupees(testSum)}  (dummy gateway — not real money)`);
  console.log(`— TOTAL (what the dashboard shows): ${rupees(realSum + testSum)}\n`);
};

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
