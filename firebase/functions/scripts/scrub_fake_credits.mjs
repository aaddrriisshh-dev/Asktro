/**
 * Remove FAKE "money in" — portal test credits — so "Money held" and the Bonus
 * figures reflect only real customers.
 *
 * A fake credit is either:
 *   - kind == 'adjustment'  (every manual portal credit; none are legit here), or
 *   - kind == 'bonus' with amount >= --bonusMax  (default ₹1,000; real welcome
 *     bonuses are all under ₹100, so they're never caught).
 * Real recharges (paid money) are NEVER touched.
 *
 * With --yes, for each owner of a fake credit it: deletes those fake
 * transactions, zeroes walletBalance / bonusBalance / chatBonusBalance, and tags
 * { isTestAccount: true }. Then RE-RUN the backfill so the rollup recomputes:
 *   node scripts/backfill_dailystats.mjs --from=2026-09-16 --yes
 *
 *   node scripts/scrub_fake_credits.mjs                 # dry run
 *   node scripts/scrub_fake_credits.mjs --bonusMax=100000   # ₹1,000 threshold (paise)
 *   node scripts/scrub_fake_credits.mjs --yes          # apply
 *
 * Dry run by default — writes NOTHING. Run from firebase/functions with
 * GOOGLE_APPLICATION_CREDENTIALS exported.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'serviceAccountKey.json';
let svc;
try { svc = JSON.parse(readFileSync(keyPath, 'utf8')); }
catch { console.error(`\nCould not read ${keyPath}.\n`); process.exit(1); }
initializeApp({ credential: cert(svc) });
const db = getFirestore();

const YES = process.argv.includes('--yes');
const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const BONUS_MAX = Number(arg('bonusMax', '100000')); // paise; bonus >= this is fake (default ₹1,000)
const money = (p) => `₹${((p || 0) / 100).toLocaleString('en-IN')}`;

const isFake = (t) => {
  const amt = Number(t.amount) || 0;
  return t.kind === 'adjustment' || (t.kind === 'bonus' && amt >= BONUS_MAX);
};

const run = async () => {
  const us = await db.collection('users').get();
  const user = new Map();
  us.forEach((d) => { const u = d.data(); user.set(d.id, { name: u.name || 'Unnamed', phone: u.phone || '', walletBalance: u.walletBalance || 0, bonusBalance: u.bonusBalance || 0, chatBonusBalance: u.chatBonusBalance || 0 }); });

  const wt = await db.collection('walletTransactions').get();
  const byUser = new Map(); // uid -> { txns:[], sum }
  wt.forEach((d) => {
    const t = d.data();
    if (!isFake(t)) return;
    const uid = t.userId || '(none)';
    const e = byUser.get(uid) || { txns: [], sum: 0 };
    e.txns.push({ ref: d.ref, kind: t.kind, amt: Number(t.amount) || 0 });
    e.sum += Number(t.amount) || 0;
    byUser.set(uid, e);
  });

  if (byUser.size === 0) { console.log('\nNo fake credits found. Nothing to do.\n'); process.exit(0); }

  console.log(`\nFake credits (adjustment, or bonus ≥ ${money(BONUS_MAX)}) across ${byUser.size} account(s):\n`);
  let totalTxns = 0, totalBal = 0;
  for (const [uid, e] of byUser) {
    const w = user.get(uid) || { name: '(deleted user)', phone: '', walletBalance: 0, bonusBalance: 0, chatBonusBalance: 0 };
    const bal = w.walletBalance + w.bonusBalance + w.chatBonusBalance;
    totalTxns += e.txns.length; totalBal += bal;
    console.log(`• ${w.name} (${w.phone || uid.slice(0, 12)})`);
    console.log(`    fake txns: ${e.txns.length} (${e.txns.map((x) => `${x.kind} ${money(x.amt)}`).join(', ')})`);
    console.log(`    current balance to zero: ${money(bal)}`);
  }
  console.log(`\nTOTAL: ${totalTxns} fake txns across ${byUser.size} account(s); ${money(totalBal)} of balances to zero.\n`);

  if (!YES) {
    console.log('Dry run — NOTHING written. Re-run with --yes to delete these and zero balances.');
    console.log('After --yes:  node scripts/backfill_dailystats.mjs --from=2026-09-16 --yes\n');
    process.exit(0);
  }

  for (const [uid, e] of byUser) {
    let batch = db.batch(), n = 0;
    for (const x of e.txns) { batch.delete(x.ref); n += 1; if (n % 400 === 0) { await batch.commit(); batch = db.batch(); } }
    if (n % 400 !== 0) await batch.commit();
    if (uid !== '(none)' && user.has(uid)) {
      await db.collection('users').doc(uid).set({
        walletBalance: 0, bonusBalance: 0, chatBonusBalance: 0,
        isTestAccount: true, testCleanedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    console.log(`  scrubbed ${(user.get(uid) || {}).name || uid}: deleted ${e.txns.length} fake txns, zeroed balance`);
  }
  console.log(`\nScrub written ✓  (${byUser.size} account(s))`);
  console.log('Now rebuild Revenue:  node scripts/backfill_dailystats.mjs --from=2026-09-16 --yes\n');
  process.exit(0);
};
run().catch((e) => { console.error(e); process.exit(1); });
