/**
 * READ-ONLY report: how much REAL (Razorpay) money the founder recharged across
 * all his own / test accounts, from day one — so he can reclaim it from the
 * company. Writes NOTHING.
 *
 * "Real money" = a user's `totalRecharge` field (the running sum of paid
 * recharges; NOT bonuses or portal adjustments). That field was NOT modified by
 * any cleanup, so it is still accurate even for accounts whose individual
 * transaction rows were deleted. For the itemised Razorpay payment IDs, use the
 * Razorpay dashboard — this is just the totals.
 *
 * Match his accounts by phone (substring) / email (exact, case-insensitive) /
 * name (substring) / explicit uid:
 *   node scripts/report_my_recharges.mjs
 *   node scripts/report_my_recharges.mjs --phones=9650589905,7551026918 --emails=a@b.com
 *
 * Run from firebase/functions with GOOGLE_APPLICATION_CREDENTIALS exported.
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
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
const PHONES = list(arg('phones', '9650589905,892948293,7551026918,6398210381'));
const EMAILS = list(arg('emails', 'aaddrriisshh@gmail.com,aaddrrissh@gmail.com,zodiacinfotag@gmail.com')).map((e) => e.toLowerCase());
const NAMES = list(arg('names', 'sahil arora')).map((n) => n.toLowerCase());
const UIDS = list(arg('uids', '2MiCcTe1L7')); // the ₹100 deleted account (prefix ok)
const money = (p) => `₹${((p || 0) / 100).toLocaleString('en-IN')}`;

const run = async () => {
  const us = await db.collection('users').get();
  const matched = new Map(); // uid -> user data
  for (const d of us.docs) {
    const u = d.data();
    const phone = String(u.phone ?? '');
    const email = String(u.email ?? '').toLowerCase();
    const name = String(u.name ?? '').toLowerCase();
    const hit =
      PHONES.some((p) => phone.includes(p)) ||
      (email && EMAILS.includes(email)) ||
      NAMES.some((n) => name && name.includes(n)) ||
      UIDS.some((x) => d.id.startsWith(x));
    if (hit) matched.set(d.id, u);
  }

  console.log(`\nMatched ${matched.size} account(s) by phone ${JSON.stringify(PHONES)} / email ${JSON.stringify(EMAILS)} / name ${JSON.stringify(NAMES)} / uid ${JSON.stringify(UIDS)}:\n`);
  let sumTotalRecharge = 0;
  for (const [uid, u] of matched) {
    const tr = u.totalRecharge || 0;
    sumTotalRecharge += tr;
    console.log(`• ${u.name || 'Unnamed'} (${u.phone || u.email || uid.slice(0, 12)})`);
    console.log(`    uid: ${uid}`);
    console.log(`    real money recharged (totalRecharge): ${money(tr)}${u.isTestAccount ? '   [tagged test]' : ''}`);
  }

  // Surviving recharge line-items — for accounts NOT cleaned they still exist and
  // give dates/refIds; also catches recharges by a deleted user doc.
  const wt = await db.collection('walletTransactions').where('kind', '==', 'recharge').get();
  const isMine = (uid) => matched.has(uid) || UIDS.some((x) => uid && uid.startsWith(x));
  const line = [];
  let deletedDocExtra = 0;
  wt.forEach((d) => {
    const t = d.data();
    if (!isMine(t.userId)) return;
    const amt = Number(t.amount) || 0;
    line.push({ uid: t.userId, amt, refId: t.refId, when: t.createdAt?.toMillis?.() ? new Date(t.createdAt.toMillis()).toLocaleString('en-IN') : '—' });
    if (!matched.has(t.userId)) deletedDocExtra += amt; // owner doc gone → not counted via totalRecharge
  });
  if (line.length) {
    console.log(`\nSurviving recharge line-items for these accounts (Razorpay-backed, for proof):`);
    for (const l of line) console.log(`  ${money(l.amt).padStart(10)}  ref ${l.refId || '—'}  ${l.when}  (${l.uid.slice(0, 12)})`);
  } else {
    console.log(`\n(No surviving recharge line-items in our DB for these accounts — they were cleaned. Use Razorpay for itemised proof; totals above are still accurate.)`);
  }

  const grand = sumTotalRecharge + deletedDocExtra;
  console.log(`\n=============================================`);
  console.log(`REAL money YOU recharged (to reclaim): ${money(grand)}`);
  console.log(`  from matched account totals: ${money(sumTotalRecharge)}`);
  if (deletedDocExtra) console.log(`  + recharges by a deleted account: ${money(deletedDocExtra)}`);
  console.log(`=============================================\n`);
  process.exit(0);
};
run().catch((e) => { console.error(e); process.exit(1); });
