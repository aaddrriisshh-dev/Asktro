/**
 * Clear all SEEDED/DEMO store content before the paid launch, so the Mall ships
 * EMPTY and honest — the app then shows its built-in "The store is being stocked
 * — check back soon" state (no fake products, ratings, testimonials or FAQs).
 * Real products/categories are added later from the admin portal; they appear
 * live via Firestore snapshots — no app update, no re-review.
 *
 * Clears: storeProducts, storeCategories, storeTestimonials, storeFaqs,
 * storeVideos, storeBanners.
 * Leaves untouched: storeOrders (real customer orders), storeCoupons (manage
 * from the portal).
 *
 * Run on the Mac (needs the Google key), from firebase/functions:
 *   node scripts/clearStoreForLaunch.js --list     # preview counts, deletes nothing
 *   node scripts/clearStoreForLaunch.js --delete    # actually clear
 */
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const COLLECTIONS = [
  'storeProducts',
  'storeCategories',
  'storeTestimonials',
  'storeFaqs',
  'storeVideos',
  'storeBanners',
];

const doDelete = process.argv.includes('--delete');

(async () => {
  let total = 0;
  for (const col of COLLECTIONS) {
    const snap = await db.collection(col).get();
    const count = snap.size;
    total += count;
    console.log(`  ${col}: ${count} doc(s)${doDelete && count ? '  → deleting' : ''}`);
    if (doDelete && count) {
      let n = 0;
      let batch = db.batch();
      for (const d of snap.docs) {
        batch.delete(d.ref);
        if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
      }
      if (n % 400 !== 0) await batch.commit();
    }
  }

  console.log(`\nStore content: ${total} doc(s) across ${COLLECTIONS.length} collections.`);
  if (!doDelete) {
    console.log('Preview only. Re-run with  --delete  to clear.');
    console.log('After clearing, the Mall shows "The store is being stocked — check back soon".');
  } else {
    console.log('Cleared. The Mall now shows the clean "being stocked" empty state.');
    console.log('storeOrders + storeCoupons were left untouched.');
    console.log('Add real, shippable products from the admin portal — they go live instantly.');
  }
  process.exit(0);
})().catch((e) => { console.error('Failed:', e); process.exit(1); });
