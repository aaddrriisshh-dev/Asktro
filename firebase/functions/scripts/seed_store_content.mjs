/**
 * Enrich the Asktro Mall catalog for a real in-app PREVIEW, and seed the new
 * storefront content blocks. Everything here becomes portal-editable in Phase B;
 * this just makes the storefront look alive today.
 *
 *  - storeProducts : adds real placeholder photos (themed per category), a
 *    rating + ratingCount, and merch flags (bestSeller / newLaunch / combo).
 *  - storeCategories : adds a category thumbnail (for "Shop by Category").
 *  - storeTestimonials / storeVideos / storeFaqs : fresh content collections.
 *
 * Placeholder media are hosted URLs (loremflickr / pravatar) — they load fine on
 * a real device; only the in-browser artifact sandbox blocks them. Replace with
 * real uploads from the portal later (no rebuild).
 *
 *   node scripts/seed_store_content.mjs         # dry run
 *   node scripts/seed_store_content.mjs --yes   # write
 *
 * Idempotent: deterministic IDs, merge writes. Run from firebase/functions with
 * a service-account key (GOOGLE_APPLICATION_CREDENTIALS).
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

// Themed, stable placeholder photos. `lock` pins the same image every load.
const flick = (kw, lock) => `https://loremflickr.com/640/640/${kw}?lock=${lock}`;
const avatar = (n) => `https://i.pravatar.cc/200?img=${n}`;

// catId → [keyword, baseLock, count]
const CATS = [
  ['rudraksha', 'beads', 10],
  ['gemstones', 'gemstone', 30],
  ['bracelets', 'bracelet', 50],
  ['yantras', 'brass', 70],
  ['malas', 'crystal', 90],
  ['pooja', 'incense', 110],
];

const BEST = new Set(['rudraksha_02', 'gemstones_01', 'bracelets_01', 'yantras_01', 'malas_02', 'pooja_09']);
const NEW = new Set(['rudraksha_08', 'gemstones_10', 'bracelets_07', 'yantras_10', 'pooja_10']);
const COMBO = new Set(['malas_10', 'pooja_05', 'pooja_06', 'rudraksha_05', 'gemstones_09']);

const TESTIMONIALS = [
  { name: 'Priya Sharma', location: 'New Delhi', img: 5, rating: 5, quote: 'The yellow sapphire came with a proper lab certificate and was beautifully packed. I finally trust buying gemstones online.' },
  { name: 'Rahul Verma', location: 'Mumbai', img: 12, rating: 5, quote: 'Got my rudraksha energised by their pandit before dispatch. Fast delivery and premium quality — exactly as shown.' },
  { name: 'Ananya Iyer', location: 'Bengaluru', img: 24, rating: 5, quote: 'Was skeptical at first, but the certificate and the astrologer’s guidance made the whole thing feel genuine and safe.' },
  { name: 'Vikram Singh', location: 'Jaipur', img: 33, rating: 5, quote: 'Beautiful brass Shree Yantra for my office. Feels auspicious every single morning. Will order again.' },
  { name: 'Meera Nair', location: 'Kochi', img: 45, rating: 5, quote: 'The 7-chakra bracelet is gorgeous and the astrologer helped me pick the right one for me. Loved the experience.' },
  { name: 'Arjun Rao', location: 'Hyderabad', img: 52, rating: 5, quote: 'Ordered a full pooja thali set for Diwali — arrived early and packed with real care. Highly recommend Asktro Mall.' },
];

const VIDEOS = [
  { title: 'How to wear your Rudraksha the right way', kw: 'meditation', lock: 5, duration: '2:41' },
  { title: 'Real vs fake gemstones — how to tell', kw: 'gemstone', lock: 8, duration: '3:18' },
  { title: 'Energising your Yantra at home', kw: 'ritual', lock: 3, duration: '4:05' },
  { title: 'Unboxing the Asktro Mall Puja Kit', kw: 'diwali', lock: 7, duration: '1:52' },
];

const FAQS = [
  { question: 'Are your gemstones certified?', answer: 'Yes. Every gemstone ships with a government-approved lab certificate (such as GRC or IGI) confirming its authenticity, weight and origin.' },
  { question: 'Are the products energised before dispatch?', answer: 'Rudraksha, yantras and idols can be energised (pran-pratishtha) by our verified pandits before we ship them — just request it at checkout.' },
  { question: 'How long does delivery take?', answer: 'Orders are dispatched within 24–48 hours and usually delivered in 3–6 business days anywhere in India. You get live tracking on every order.' },
  { question: 'Do you offer Cash on Delivery?', answer: 'Right now we accept secure online payments — UPI, cards and net-banking — for faster, safer dispatch. Cash on Delivery is coming soon.' },
  { question: 'Can I return a product?', answer: 'Unused products in their original packaging can be returned within 7 days. Energised or personalised items are non-returnable, as per our policy.' },
  { question: 'How do I choose the right gemstone for me?', answer: 'Talk to an Asktro astrologer — they read your birth chart and recommend the right stone, weight and metal, so you buy with confidence.' },
];

async function main() {
  let prods = 0;
  console.log(`${YES ? 'Writing' : 'Would write'} product media/flags, category images, testimonials, videos, FAQs\n`);

  for (const [catId, kw, base] of CATS) {
    // Category thumbnail for the "Shop by Category" grid.
    if (YES) {
      await db.collection('storeCategories').doc(catId).set(
        { image: flick(kw, base + 900), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    for (let pi = 1; pi <= 10; pi++) {
      const pid = `${catId}_${String(pi).padStart(2, '0')}`;
      const images = [flick(kw, base + pi), flick(kw, base + pi + 200), flick(kw, base + pi + 400)];
      const rating = 4.5 + ((pi * 7) % 5) / 10; // 4.5–4.9
      const ratingCount = 40 + ((pi * 53) % 380);
      const patch = {
        images,
        rating,
        ratingCount,
        bestSeller: BEST.has(pid),
        newLaunch: NEW.has(pid),
        combo: COMBO.has(pid),
        updatedAt: FieldValue.serverTimestamp(),
      };
      prods++;
      console.log(`  🛍️  ${pid}  ★${rating.toFixed(1)} (${ratingCount})` +
        `${patch.bestSeller ? ' [BEST]' : ''}${patch.newLaunch ? ' [NEW]' : ''}${patch.combo ? ' [COMBO]' : ''}`);
      if (YES) await db.collection('storeProducts').doc(pid).set(patch, { merge: true });
    }
  }

  console.log(`\n  💬 ${TESTIMONIALS.length} testimonials, 🎬 ${VIDEOS.length} videos, ❓ ${FAQS.length} FAQs`);
  if (YES) {
    for (let i = 0; i < TESTIMONIALS.length; i++) {
      const t = TESTIMONIALS[i];
      await db.collection('storeTestimonials').doc(`seed_${i + 1}`).set(
        { name: t.name, location: t.location, avatar: avatar(t.img), rating: t.rating, quote: t.quote, sortOrder: i, active: true, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    for (let i = 0; i < VIDEOS.length; i++) {
      const v = VIDEOS[i];
      await db.collection('storeVideos').doc(`seed_${i + 1}`).set(
        { title: v.title, thumb: flick(v.kw, v.lock + 700), url: '', duration: v.duration, sortOrder: i, active: true, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    for (let i = 0; i < FAQS.length; i++) {
      const f = FAQS[i];
      await db.collection('storeFaqs').doc(`seed_${i + 1}`).set(
        { question: f.question, answer: f.answer, sortOrder: i, active: true, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
  }

  console.log(`\n${YES ? '✔ Seeded' : 'Would seed'} ${prods} products + content blocks.`);
  if (!YES) console.log('\n(dry run — pass --yes to write)\n');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
