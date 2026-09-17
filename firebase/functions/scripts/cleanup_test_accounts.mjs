/**
 * One-time cleanup of TEST / self accounts so the dashboards show only real
 * customer money.
 *
 * The founder's own number and a couple of teammates recharge/credit from the
 * portal for testing. That fake money inflates "Money held & owed" (a live sum
 * of every wallet balance) and Revenue (their self-recharges land in the rollup).
 * This script finds those accounts and, with --yes:
 *   - deletes their walletTransactions (their self-recharges / credits),
 *   - zeroes walletBalance / bonusBalance / chatBonusBalance,
 *   - tags them { isTestAccount: true } so we can spot them later.
 * Then RE-RUN the daily-stats backfill so Revenue recomputes without them:
 *   node scripts/backfill_dailystats.mjs --from=2026-09-16 --yes
 *
 * Match targets by phone (substring) and/or name (case-insensitive substring):
 *   node scripts/cleanup_test_accounts.mjs                                  # dry run, defaults
 *   node scripts/cleanup_test_accounts.mjs --phones=9650589905 --names=vinit,sanjay
 *   node scripts/cleanup_test_accounts.mjs --phones=9650589905 --names=vinit,sanjay --yes
 *
 * Dry run by default — prints exactly which accounts + transactions would be
 * affected and writes NOTHING. Re-run with --yes to apply.
 *
 * Run from firebase/functions with GOOGLE_APPLICATION_CREDENTIALS (the Google
 * JSON) exported, same as the deploy.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'serviceAccountKey.json';
let svc;
try {
  svc = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch {
  console.error(`\nCould not read ${keyPath}. Run from firebase/functions with the service-account key.\n`);
  process.exit(1);
}
initializeApp({ credential: cert(svc) });
const db = getFirestore();

const YES = process.argv.includes('--yes');
const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const PHONES = arg('phones', '9650589905').split(',').map((s) => s.trim()).filter(Boolean);
const NAMES = arg('names', 'vinit,sanjay').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const money = (p) => `₹${((p || 0) / 100).toLocaleString('en-IN')}`;

const run = async () => {
  console.log(`\nMatching test accounts by phone ${JSON.stringify(PHONES)} or name ${JSON.stringify(NAMES)}…\n`);

  // Scan all users (small collection) and match by phone-substring or name-substring.
  const us = await db.collection('users').get();
  const targets = [];
  for (const d of us.docs) {
    const u = d.data();
    const phone = String(u.phone ?? '');
    const name = String(u.name ?? '').toLowerCase();
    const phoneHit = PHONES.some((p) => phone.includes(p));
    const nameHit = NAMES.some((n) => name.includes(n));
    if (phoneHit || nameHit) targets.push({ id: d.id, u, why: phoneHit ? 'phone' : 'name' });
  }

  if (targets.length === 0) {
    console.log('No matching accounts found. Nothing to do.\n');
    process.exit(0);
  }

  let grandTxns = 0, grandTxnSum = 0, grandBalances = 0;
  for (const t of targets) {
    const { id, u, why } = t;
    // That user's wallet ledger.
    const wt = await db.collection('walletTransactions').where('userId', '==', id).get();
    const byKind = {};
    let sum = 0;
    wt.forEach((w) => { const x = w.data(); byKind[x.kind] = (byKind[x.kind] || 0) + 1; sum += Number(x.amount) || 0; });
    const bal = (u.walletBalance || 0) + (u.bonusBalance || 0) + (u.chatBonusBalance || 0);
    grandTxns += wt.size; grandTxnSum += sum; grandBalances += bal;

    console.log(`• ${u.name || 'Unnamed'}  (${u.phone || id})  [matched by ${why}]`);
    console.log(`    uid: ${id}`);
    console.log(`    balances: wallet ${money(u.walletBalance)} · bonus ${money(u.bonusBalance)} · chatBonus ${money(u.chatBonusBalance)}  → total ${money(bal)}`);
    console.log(`    walletTransactions: ${wt.size}  (net ${money(sum)})  kinds ${JSON.stringify(byKind)}`);
    console.log('');
  }

  console.log(`TOTAL across ${targets.length} account(s): ${grandTxns} transactions, wallet balances ${money(grandBalances)} to clear.\n`);

  if (!YES) {
    console.log('Dry run — NOTHING written. Re-run with --yes to delete those transactions, zero the balances, and tag the accounts.\n');
    console.log('After --yes, rebuild Revenue with:  node scripts/backfill_dailystats.mjs --from=2026-09-16 --yes\n');
    process.exit(0);
  }

  for (const t of targets) {
    const { id } = t;
    // Delete the user's walletTransactions in batches.
    const wt = await db.collection('walletTransactions').where('userId', '==', id).get();
    let batch = db.batch(), n = 0;
    for (const w of wt.docs) {
      batch.delete(w.ref); n += 1;
      if (n % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (n % 400 !== 0) await batch.commit();
    // Zero balances + tag as a test account.
    await db.collection('users').doc(id).set({
      walletBalance: 0, bonusBalance: 0, chatBonusBalance: 0,
      isTestAccount: true, testCleanedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`  cleaned ${t.u.name || id}: deleted ${wt.size} txns, zeroed balances, tagged isTestAccount`);
  }

  console.log(`\nCleanup written ✓  (${targets.length} account(s))`);
  console.log('Now rebuild Revenue:  node scripts/backfill_dailystats.mjs --from=2026-09-16 --yes\n');
  process.exit(0);
};

run().catch((e) => { console.error(e); process.exit(1); });
