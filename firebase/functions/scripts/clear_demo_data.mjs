/**
 * One-shot cleanup for the remaining pre-launch DEMO data that the tagged
 * `--clear` paths don't cover:
 *
 *   1. The 8 fixed-id demo human astrologers from firebase/scripts/seed_astrologers.mjs
 *      (ids seed-astro-01 … seed-astro-08) — plain directory docs, no --clear.
 *   2. Anything tagged { __demo: true } (from seed_astrologer_demo.mjs) across the
 *      collections it touches, plus the fixed demo_cust_1..3 customer docs.
 *
 * It NEVER touches the 51 AI astrologers ({ __seedAI: true }) or any real data.
 * Prints exactly what it found, then deletes. Safe/idempotent — run it again and
 * it reports zeros.
 *
 *   cd firebase/functions
 *   GOOGLE_APPLICATION_CREDENTIALS=<key.json> node scripts/clear_demo_data.mjs
 *   # add --dry to only report, delete nothing:
 *   GOOGLE_APPLICATION_CREDENTIALS=<key.json> node scripts/clear_demo_data.mjs --dry
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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

const DRY = process.argv.includes('--dry');
const SEED_ASTRO_IDS = Array.from({ length: 8 }, (_, i) => `seed-astro-${String(i + 1).padStart(2, '0')}`);
const DEMO_CUST_IDS = ['demo_cust_1', 'demo_cust_2', 'demo_cust_3'];
// Collections that seed_astrologer_demo.mjs stamps with { __demo: true }.
const DEMO_COLLECTIONS = ['astrologers', 'users', 'consultations', 'notifications', 'payouts', 'walletTransactions'];

let removed = 0;
async function del(ref, sub) {
  // A consultation may carry a `messages` subcollection — clear it first.
  if (sub) {
    const msgs = await ref.collection('messages').get();
    for (const m of msgs.docs) { if (!DRY) await m.ref.delete(); removed++; }
  }
  if (!DRY) await ref.delete();
  removed++;
}

async function run() {
  console.log(DRY ? 'DRY RUN — reporting only, nothing deleted.\n' : 'Clearing remaining demo data…\n');

  // 1) The 8 fixed-id demo human astrologers (+ any private subcollection docs).
  let astroN = 0;
  for (const id of SEED_ASTRO_IDS) {
    const ref = db.collection('astrologers').doc(id);
    const snap = await ref.get();
    if (!snap.exists) continue;
    for (const p of ['private']) {
      const priv = await ref.collection(p).get();
      for (const d of priv.docs) { if (!DRY) await d.ref.delete(); removed++; }
    }
    await del(ref, false);
    astroN++;
  }
  console.log(`  demo human astrologers (seed-astro-*): ${astroN}`);

  // 2) Everything tagged __demo across the demo collections.
  for (const coll of DEMO_COLLECTIONS) {
    const q = await db.collection(coll).where('__demo', '==', true).get();
    for (const d of q.docs) await del(d.ref, coll === 'consultations');
    if (q.size) console.log(`  __demo in ${coll}: ${q.size}`);
  }

  // 3) The fixed demo customer docs.
  let custN = 0;
  for (const id of DEMO_CUST_IDS) {
    const ref = db.collection('users').doc(id);
    if ((await ref.get()).exists) { if (!DRY) await ref.delete(); removed++; custN++; }
  }
  console.log(`  demo customers (demo_cust_*): ${custN}`);

  console.log(`\n${DRY ? 'Would remove' : '✓ Removed'} ${removed} demo documents.`);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
