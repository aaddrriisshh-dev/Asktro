/**
 * Seed the "Triple Dhamaka" welcome recharge plan (`rechargePlans/promo_welcome`)
 * used by the first-recharge welcome offer shown to users who have never paid.
 *
 * The offer: user pays ₹29.50 (₹25 + 18% GST) and gets ₹50 in their wallet
 * (₹25 walletCredit + ₹25 bonus). Locked to a user's FIRST recharge only —
 * enforced server-side in createRechargeOrder via `firstRechargeOnly`.
 *
 *   node scripts/seed_welcome_plan.mjs         # dry run (prints what it will write)
 *   node scripts/seed_welcome_plan.mjs --yes   # actually write rechargePlans/promo_welcome
 *
 * Run from firebase/functions (needs serviceAccountKey.json or
 * GOOGLE_APPLICATION_CREDENTIALS pointing at the key).
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
const YES = process.argv.includes('--yes');

const PLAN_ID = 'promo_welcome';
const PLAN = {
  title: 'Welcome Offer',
  amount: 2950, // paise charged (₹25 + 18% GST = ₹29.50)
  walletCredit: 2500, // paise credited to spendable wallet (₹25)
  bonus: 2500, // paise bonus credit (₹25) — total ₹50 in wallet
  firstRechargeOnly: true, // server rejects it once the user has ever recharged
  isOffer: true,
  active: true,
};

async function main() {
  console.log(`${YES ? 'Writing' : 'Would write'} rechargePlans/${PLAN_ID}:`);
  console.log(JSON.stringify(PLAN, null, 2));
  console.log(
    `\n  → charge ₹${(PLAN.amount / 100).toFixed(2)}  |  credit ₹${((PLAN.walletCredit + PLAN.bonus) / 100).toFixed(0)} ` +
    `(₹${(PLAN.walletCredit / 100).toFixed(0)} wallet + ₹${(PLAN.bonus / 100).toFixed(0)} bonus)  |  first recharge only`,
  );

  if (YES) {
    await db.collection('rechargePlans').doc(PLAN_ID).set({
      ...PLAN,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log('\n✔ Seeded rechargePlans/promo_welcome.\n');
  } else {
    console.log('\n(dry run — pass --yes to write)\n');
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
