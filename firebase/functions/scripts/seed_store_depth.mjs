/**
 * Add category-appropriate Specifications to every seeded product, so the
 * product page's Specifications table looks complete for review. Factual
 * attributes only — no reviews or rating counts are fabricated here (add real
 * reviews from the portal: Store Content → Product Reviews).
 *
 *   node scripts/seed_store_depth.mjs         # dry run
 *   node scripts/seed_store_depth.mjs --yes   # write specs onto products
 *
 * Idempotent (merge writes on deterministic product IDs). Run from
 * firebase/functions with a service-account key (GOOGLE_APPLICATION_CREDENTIALS).
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

// Specs per category (k = label, v = value). Generic-but-plausible placeholders.
const SPECS = {
  rudraksha: [
    { k: 'Origin', v: 'Nepal' },
    { k: 'Certification', v: 'Lab certified' },
    { k: 'Bead material', v: 'Natural rudraksha seed' },
    { k: 'Energised', v: 'Yes (on request)' },
  ],
  gemstones: [
    { k: 'Origin', v: 'Natural, ethically sourced' },
    { k: 'Certification', v: 'Govt.-approved lab certificate' },
    { k: 'Treatment', v: 'Unheated / untreated' },
    { k: 'Cut', v: 'Faceted / oval' },
  ],
  bracelets: [
    { k: 'Bead size', v: '8 mm' },
    { k: 'Fitting', v: 'Elasticated, one size' },
    { k: 'Material', v: 'Natural crystal beads' },
    { k: 'Cleansing', v: 'Charged before dispatch' },
  ],
  yantras: [
    { k: 'Metal', v: 'Copper' },
    { k: 'Size', v: '3 × 3 inch' },
    { k: 'Finish', v: 'Embossed' },
    { k: 'Energised', v: 'Yes, by our pandits' },
  ],
  malas: [
    { k: 'Beads', v: '108 + 1 guru bead' },
    { k: 'Knotting', v: 'Hand-knotted' },
    { k: 'Use', v: 'Japa / meditation' },
    { k: 'Material', v: 'Natural beads' },
  ],
  pooja: [
    { k: 'Material', v: 'Brass / traditional' },
    { k: 'Use', v: 'Daily pooja & festivals' },
    { k: 'Made in', v: 'India' },
    { k: 'Care', v: 'Wipe clean with dry cloth' },
  ],
};

const CATS = ['rudraksha', 'gemstones', 'bracelets', 'yantras', 'malas', 'pooja'];

async function main() {
  let n = 0;
  console.log(`${YES ? 'Writing' : 'Would write'} specs onto products\n`);
  for (const cat of CATS) {
    const specs = SPECS[cat];
    for (let pi = 1; pi <= 10; pi++) {
      const pid = `${cat}_${String(pi).padStart(2, '0')}`;
      n++;
      console.log(`  📋 ${pid} — ${specs.length} specs`);
      if (YES) {
        await db.collection('storeProducts').doc(pid).set(
          { specs, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      }
    }
  }
  console.log(`\n${YES ? '✔ Wrote' : 'Would write'} specs to ${n} products.`);
  if (!YES) console.log('\n(dry run — pass --yes to write)\n');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
