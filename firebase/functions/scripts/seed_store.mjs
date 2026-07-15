/**
 * Seed the AstroMall store: 6 categories × ~10 placeholder products each, plus a
 * `config/store` doc with shipping defaults. Prices are sensible placeholders in
 * paise; images are left blank (upload real photos later from the admin portal —
 * no rebuild needed). Everything here is editable in the portal.
 *
 *   node scripts/seed_store.mjs          # dry run (prints what it will write)
 *   node scripts/seed_store.mjs --yes    # actually write the catalog
 *
 * Idempotent: category + product docs use deterministic IDs, so re-running
 * updates in place instead of duplicating. Run from firebase/functions with a
 * service-account key (GOOGLE_APPLICATION_CREDENTIALS).
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

// ₹ → paise
const P = (rupees) => Math.round(rupees * 100);

// Each product: [name, priceRupees, mrpRupees, shortDesc]
const CATALOG = [
  {
    id: 'rudraksha', name: 'Rudraksha', emoji: '📿',
    blurb: 'Sacred rudraksha beads & malas',
    products: [
      ['1 Mukhi Rudraksha', 2100, 3100, 'Rare single-face bead for focus and clarity.'],
      ['5 Mukhi Rudraksha', 351, 599, 'The most worn bead — peace and good health.'],
      ['7 Mukhi Rudraksha', 899, 1299, 'Associated with prosperity and Goddess Lakshmi.'],
      ['Rudraksha Mala (108 beads)', 799, 1199, 'Hand-knotted 108-bead mala for japa.'],
      ['Panchmukhi Bracelet', 499, 799, 'Elasticated 5-mukhi bead bracelet.'],
      ['Gauri Shankar Rudraksha', 1299, 1899, 'Joined beads for harmony in relationships.'],
      ['Rudraksha Kanthi', 599, 899, 'Short neck mala worn close to the throat.'],
      ['Nepali 5 Mukhi Mala', 1499, 2199, 'Premium large Nepali-origin beads.'],
      ['Rudraksha Pendant (silver cap)', 699, 999, 'Single bead in a 92.5 silver cap.'],
      ['Kids Rudraksha Bracelet', 299, 499, 'Small soft bracelet for children.'],
    ],
  },
  {
    id: 'gemstones', name: 'Gemstones', emoji: '💎',
    blurb: 'Certified astrological gemstones',
    products: [
      ['Yellow Sapphire (Pukhraj)', 5999, 8999, 'Jupiter stone — wisdom and fortune.'],
      ['Blue Sapphire (Neelam)', 6999, 9999, 'Saturn stone — fast-acting, worn with care.'],
      ['Ruby (Manik)', 4999, 7499, 'Sun stone — confidence and vitality.'],
      ['Emerald (Panna)', 4599, 6999, 'Mercury stone — intellect and communication.'],
      ['Pearl (Moti)', 1499, 2299, 'Moon stone — calm and emotional balance.'],
      ['Red Coral (Moonga)', 1999, 2999, 'Mars stone — courage and energy.'],
      ['Hessonite (Gomed)', 1799, 2599, 'Rahu stone — clarity through confusion.'],
      ['Cat’s Eye (Lehsunia)', 2199, 3199, 'Ketu stone — protection and intuition.'],
      ['Opal', 2499, 3599, 'Venus alternative — love and luxury.'],
      ['Certified Gemstone Ring', 3499, 4999, 'Your stone set in an adjustable silver ring.'],
    ],
  },
  {
    id: 'bracelets', name: 'Bracelets', emoji: '🪬',
    blurb: 'Crystal & energised bracelets',
    products: [
      ['7 Chakra Bracelet', 399, 699, 'Balances all seven chakras.'],
      ['Black Tourmaline Bracelet', 499, 799, 'Protection from negative energy.'],
      ['Amethyst Bracelet', 549, 849, 'Calm, sleep and spiritual growth.'],
      ['Rose Quartz Bracelet', 449, 749, 'Attracts love and self-worth.'],
      ['Tiger Eye Bracelet', 399, 699, 'Willpower, courage and focus.'],
      ['Green Aventurine Bracelet', 449, 749, 'Luck, opportunity and prosperity.'],
      ['Pyrite Bracelet', 599, 899, 'Wealth and abundance magnet.'],
      ['Citrine Bracelet', 549, 849, 'The merchant’s stone for money flow.'],
      ['Lava + Rudraksha Bracelet', 399, 649, 'Grounding with sacred beads.'],
      ['Evil Eye Bracelet', 299, 499, 'Classic nazar protection.'],
    ],
  },
  {
    id: 'yantras', name: 'Yantras', emoji: '🔯',
    blurb: 'Energised yantras for home & pooja',
    products: [
      ['Shree Yantra (copper)', 799, 1199, 'The king of yantras — wealth & harmony.'],
      ['Kuber Yantra', 599, 899, 'Attracts money and financial stability.'],
      ['Vastu Yantra', 649, 999, 'Corrects vastu dosha in home/office.'],
      ['Mahalakshmi Yantra', 599, 899, 'Blessings of Goddess Lakshmi.'],
      ['Navgrah Yantra', 749, 1099, 'Balances all nine planets.'],
      ['Ganesh Yantra', 549, 799, 'Removes obstacles, new beginnings.'],
      ['Saraswati Yantra', 549, 799, 'Knowledge, learning and arts.'],
      ['Business Yantra', 899, 1299, 'Growth and success in enterprise.'],
      ['Car Dashboard Yantra', 299, 499, 'Safe-travel protection yantra.'],
      ['Gold-plated Shree Yantra', 1499, 2199, 'Premium gold-plated centrepiece.'],
    ],
  },
  {
    id: 'malas', name: 'Malas & Beads', emoji: '🧿',
    blurb: 'Japa malas for chanting',
    products: [
      ['Tulsi Mala', 349, 599, 'Traditional tulsi wood japa mala.'],
      ['Sphatik (Crystal) Mala', 699, 999, 'Cooling clear-quartz mala.'],
      ['Sandalwood Mala', 599, 899, 'Fragrant chandan beads.'],
      ['Lotus Seed Mala', 449, 699, 'Kamalgatta mala for Lakshmi sadhana.'],
      ['Black Hakik Mala', 399, 649, 'Protective black agate mala.'],
      ['Moti (Pearl) Mala', 799, 1199, 'Soft white moon-energy mala.'],
      ['Red Chandan Mala', 549, 849, 'Red sandalwood chanting mala.'],
      ['Vaijayanti Mala', 349, 549, 'Beads worn in Krishna bhakti.'],
      ['Parad (Mercury) Bead', 1299, 1899, 'Solidified-mercury sacred bead.'],
      ['Kamal Gatta + Sphatik Combo', 899, 1299, 'Two-mala prosperity set.'],
    ],
  },
  {
    id: 'pooja', name: 'Pooja Essentials', emoji: '🪔',
    blurb: 'Everything for your daily pooja',
    products: [
      ['Brass Diya (pair)', 299, 499, 'Traditional brass oil lamps.'],
      ['Camphor (Kapoor) Pack', 149, 249, 'Pure camphor tablets for aarti.'],
      ['Loban / Sambrani Cups', 199, 349, 'Fragrant dhoop cups (pack of 12).'],
      ['Gangajal Bottle', 99, 199, 'Sealed holy Ganga water.'],
      ['Kalash with Coconut Set', 499, 799, 'Complete kalash sthapana set.'],
      ['Panchamrit Kit', 349, 599, 'Milk-honey-ghee-curd-sugar pooja kit.'],
      ['Havan Samagri (500g)', 249, 399, 'Ready havan mix with samidha.'],
      ['Kumkum & Chandan Set', 199, 349, 'Roli, kumkum and chandan tikka set.'],
      ['Pooja Thali (decorated)', 699, 1099, 'Steel decorated aarti thali.'],
      ['Idol — Ganesha (brass)', 899, 1399, 'Small brass Ganesha for the mandir.'],
    ],
  },
];

async function main() {
  let cats = 0, prods = 0;
  console.log(`${YES ? 'Writing' : 'Would write'} config/store + ${CATALOG.length} categories:\n`);

  if (YES) {
    await db.doc('config/store').set({
      shippingFeePaise: P(49),
      freeShippingThresholdPaise: P(499),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  for (let ci = 0; ci < CATALOG.length; ci++) {
    const c = CATALOG[ci];
    cats++;
    console.log(`  📁 ${c.emoji} ${c.name}  (${c.products.length} products)`);
    if (YES) {
      await db.collection('storeCategories').doc(c.id).set({
        name: c.name, emoji: c.emoji, blurb: c.blurb,
        image: '', sortOrder: ci, active: true,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    for (let pi = 0; pi < c.products.length; pi++) {
      const [title, price, mrp, desc] = c.products[pi];
      prods++;
      const pid = `${c.id}_${String(pi + 1).padStart(2, '0')}`;
      if (YES) {
        await db.collection('storeProducts').doc(pid).set({
          title, description: desc,
          categoryId: c.id, categoryName: c.name,
          pricePaise: P(price), mrpPaise: P(mrp),
          images: [], stock: 100, sku: pid.toUpperCase(),
          sortOrder: pi, active: true,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
  }

  console.log(`\n${YES ? '✔ Seeded' : 'Would seed'} ${cats} categories and ${prods} products.`);
  console.log(YES
    ? '\nNext: open the admin portal → Store to add real photos, tweak prices, and set stock.\n'
    : '\n(dry run — pass --yes to write)\n');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
