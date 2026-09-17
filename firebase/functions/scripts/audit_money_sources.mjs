/**
 * Read-only audit of every "money in" event, so we can verify the ledger matches
 * reality: exactly ONE real paying customer (₹20), everything else is
 * partner/portal test money.
 *
 * Lists each walletTransaction whose kind is a money-in that ISN'T the automatic
 * welcome bonus — i.e. `recharge` (real paid money) and `adjustment` (a manual
 * portal credit) and any large `bonus` (a manual portal bonus, above the normal
 * welcome grant). For each it resolves the owner (name / phone) and flags whether
 * that account is already tagged isTestAccount.
 *
 *   node scripts/audit_money_sources.mjs                 # recharge + adjustment + bonus>₹100
 *   node scripts/audit_money_sources.mjs --bonusMin=0    # include every bonus too
 *
 * Writes NOTHING. Run from firebase/functions with GOOGLE_APPLICATION_CREDENTIALS.
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

const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const BONUS_MIN = Number(arg('bonusMin', '10000')); // paise; default flag bonuses > ₹100
const money = (p) => `₹${((p || 0) / 100).toLocaleString('en-IN')}`;
const fmt = (ts) => { const ms = ts?.toMillis?.(); return ms ? new Date(ms).toLocaleString('en-IN') : '—'; };

const run = async () => {
  // Owner lookup.
  const us = await db.collection('users').get();
  const user = new Map();
  us.forEach((d) => { const u = d.data(); user.set(d.id, { name: u.name || 'Unnamed', phone: u.phone || '', test: !!u.isTestAccount }); });

  const wt = await db.collection('walletTransactions').get();
  const rows = [];
  const totals = {};
  wt.forEach((d) => {
    const t = d.data();
    const kind = t.kind;
    const amt = Number(t.amount) || 0;
    const moneyIn = kind === 'recharge' || kind === 'adjustment' || (kind === 'bonus' && amt >= BONUS_MIN);
    if (!moneyIn) return;
    totals[kind] = (totals[kind] || 0) + amt;
    const who = user.get(t.userId) || { name: '??', phone: '', test: false };
    rows.push({ kind, amt, who, userId: t.userId, when: fmt(t.createdAt) });
  });

  rows.sort((a, b) => b.amt - a.amt);
  console.log(`\nMoney-in events (recharge + adjustment + bonus ≥ ${money(BONUS_MIN)}) — ${rows.length} rows:\n`);
  for (const r of rows) {
    const tag = r.who.test ? '  [isTestAccount]' : '';
    console.log(`  ${r.kind.padEnd(11)} ${money(r.amt).padStart(14)}   ${r.who.name} (${r.who.phone || r.userId.slice(0, 10)})${tag}`);
    console.log(`               ${r.when}`);
  }
  console.log('\nTotals by kind:');
  for (const [k, v] of Object.entries(totals)) console.log(`  ${k}: ${money(v)}`);

  // The real picture: recharges from accounts NOT tagged test.
  const realRecharges = rows.filter((r) => r.kind === 'recharge' && !r.who.test);
  const realSum = realRecharges.reduce((a, r) => a + r.amt, 0);
  console.log(`\nREAL paid recharges (excluding isTestAccount): ${realRecharges.length} totalling ${money(realSum)}`);
  for (const r of realRecharges) console.log(`  • ${money(r.amt)} — ${r.who.name} (${r.who.phone || r.userId.slice(0, 10)})  ${r.when}`);
  console.log('');
  process.exit(0);
};
run().catch((e) => { console.error(e); process.exit(1); });
