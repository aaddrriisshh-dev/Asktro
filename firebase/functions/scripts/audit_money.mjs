/**
 * READ-ONLY money audit. Prints the exact real state so we can decide what (if
 * anything) to wipe before launch testing. Deletes NOTHING.
 *
 *   cd firebase/functions
 *   GOOGLE_APPLICATION_CREDENTIALS=<key.json> node scripts/audit_money.mjs
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'serviceAccountKey.json';
let svc;
try { svc = JSON.parse(readFileSync(keyPath, 'utf8')); }
catch { console.error(`\nCould not read ${keyPath}.\n`); process.exit(1); }
initializeApp({ credential: cert(svc) });
const db = getFirestore();

const rup = (p) => `₹${((p ?? 0) / 100).toLocaleString('en-IN')}`;

async function run() {
  // ---- customers (users collection) ----
  const users = await db.collection('users').get();
  let held = 0;
  console.log(`\n==== CUSTOMERS (${users.size}) ====`);
  console.log('name | phone | wallet | bonus | chatBonus | totalRecharge | guest?');
  for (const d of users.docs) {
    const u = d.data();
    const w = u.walletBalance ?? 0, b = u.bonusBalance ?? 0, cb = u.chatBonusBalance ?? 0;
    held += w + b + cb;
    console.log(
      `${(u.name || u.displayName || '—')} | ${u.phone || '—'} | ${rup(w)} | ${rup(b)} | ${rup(cb)} | ${rup(u.totalRecharge)} | ${u.isGuest === true || u.name === 'Guest' ? 'yes' : 'no'}  [${d.id}]`,
    );
  }
  console.log(`\n  TOTAL money held (wallet+bonus+chatBonus across all customers): ${rup(held)}`);

  // ---- wallet transactions, grouped by kind ----
  const txns = await db.collection('walletTransactions').get();
  const byKind = {};
  for (const d of txns.docs) {
    const t = d.data();
    const k = t.kind || 'unknown';
    byKind[k] = byKind[k] || { count: 0, sum: 0 };
    byKind[k].count++; byKind[k].sum += t.amount ?? 0;
  }
  console.log(`\n==== WALLET TRANSACTIONS (${txns.size}) — by kind ====`);
  for (const [k, v] of Object.entries(byKind)) {
    console.log(`  ${k.padEnd(14)} count=${String(v.count).padStart(4)}   net=${rup(v.sum)}`);
  }

  // ---- the actual recharge rows (what SHOULD equal real revenue) ----
  const recharges = txns.docs.map((d) => d.data()).filter((t) => t.kind === 'recharge');
  console.log(`\n==== RECHARGE ROWS (${recharges.length}) ====`);
  for (const r of recharges) {
    console.log(`  ${rup(r.amount)}  ref=${r.refId || '—'}  note=${r.note || '—'}  user=${r.userId}`);
  }
  const realRecharge = recharges.reduce((n, r) => n + (r.amount ?? 0), 0);
  console.log(`\n  SUM of real recharges: ${rup(realRecharge)}`);

  // ---- astrologer accruals ----
  const ledger = await db.collection('astrologerLedger').get();
  let earn = 0;
  for (const d of ledger.docs) earn += d.data().amount ?? 0;
  console.log(`\n==== ASTROLOGER LEDGER: ${ledger.size} rows, net ${rup(earn)} ====`);

  console.log('\nDone (read-only — nothing changed).\n');
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
