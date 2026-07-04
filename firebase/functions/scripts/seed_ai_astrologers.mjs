/**
 * Seed 51 AI astrologers into the `astrologers` collection so the customer app
 * and admin portal have a rich, browsable directory. These are AI personas
 * (isAI: true) with Indian names, portrait photos, specialties, an Asktro-
 * verified tag and varied per-minute pricing (so per-astrologer pricing shows).
 *
 * Every doc is tagged { __seedAI: true } so it can be removed in one shot:
 *
 *   node scripts/seed_ai_astrologers.mjs           # insert the 51 AI astrologers
 *   node scripts/seed_ai_astrologers.mjs --clear   # delete only these
 *
 * NOTE on photos: the portraits use randomuser.me placeholder faces so the demo
 * looks real. Before launch, swap `profilePhoto` for real AI-generated Indian
 * astrologer images (a batch update on isAI==true docs).
 *
 * Run from inside the firebase/functions folder (needs serviceAccountKey.json).
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

// ---- auth ------------------------------------------------------------------
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

// ---- helpers ---------------------------------------------------------------
const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const chance = (p) => Math.random() < p;
function sample(arr, k) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < k && copy.length; i++) out.push(copy.splice(rand(copy.length), 1)[0]);
  return out;
}

// ---- name & content pools --------------------------------------------------
const HONORIFIC_M = ['Acharya', 'Pandit', 'Guru', 'Jyotishi', 'Shastri', 'Dr.'];
const HONORIFIC_F = ['Acharya', 'Guru Maa', 'Jyotishi', 'Dr.', 'Devi'];
const MALE_FIRST = ['Aarav', 'Aditya', 'Arjun', 'Krishna', 'Ishaan', 'Rohan', 'Kabir', 'Aryan', 'Dhruv',
  'Vivek', 'Rajesh', 'Suresh', 'Mahesh', 'Anil', 'Deepak', 'Gopal', 'Harish', 'Naveen', 'Prakash',
  'Ramesh', 'Sanjay', 'Vikram', 'Yogesh', 'Mohan', 'Shankar', 'Balaji'];
const FEMALE_FIRST = ['Ananya', 'Diya', 'Aadhya', 'Saanvi', 'Anika', 'Navya', 'Sara', 'Aisha', 'Neha',
  'Priya', 'Riya', 'Meera', 'Kavya', 'Tara', 'Lakshmi', 'Sunita', 'Radha', 'Geeta', 'Pooja',
  'Sneha', 'Deepika', 'Anjali', 'Nandini', 'Shalini', 'Rekha'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Iyer', 'Nair', 'Reddy', 'Rao', 'Patel', 'Singh', 'Das',
  'Bose', 'Menon', 'Kapoor', 'Malhotra', 'Chopra', 'Joshi', 'Trivedi', 'Shastri', 'Bhat', 'Pillai'];
const LANGS = ['Hindi', 'English', 'Tamil', 'Telugu', 'Bengali', 'Marathi', 'Kannada', 'Punjabi', 'Gujarati', 'Malayalam'];
const EXPERTISE = ['Vedic Astrology', 'Numerology', 'Tarot', 'Palmistry', 'Vastu', 'KP System', 'Nadi',
  'Lal Kitab', 'Prashna', 'Face Reading', 'Vedic Remedies', 'Kundli Matching'];
// AI personas are priced uniformly: ₹9/min, 35% platform commission.
const AI_RATE_PAISE = 900;
const AI_COMMISSION = 35;
const ABOUT = [
  'brings clarity to matters of career, love and destiny with time-tested Vedic wisdom.',
  'specialises in relationship, marriage and compatibility guidance rooted in your birth chart.',
  'combines classical astrology with practical remedies to help you move forward with confidence.',
  'reads the planets to guide decisions on career, finance and life direction.',
  'offers compassionate, honest guidance and simple remedies you can actually follow.',
  'helps you understand your Dasha periods and the timing of important life events.',
];

function buildNames(count) {
  const names = new Set();
  const list = [];
  let i = 0;
  while (list.length < count) {
    const isMale = i % 2 === 0;
    const first = pick(isMale ? MALE_FIRST : FEMALE_FIRST);
    const last = pick(LAST);
    const hon = chance(0.75) ? pick(isMale ? HONORIFIC_M : HONORIFIC_F) + ' ' : '';
    const full = `${hon}${first} ${last}`;
    if (!names.has(full)) {
      names.add(full);
      list.push({ full, isMale, first });
    }
    i++;
  }
  return list;
}

async function seed() {
  const people = buildNames(51);
  let batch = db.batch();
  let n = 0;
  people.forEach((p, idx) => {
    const online = chance(0.8);
    const rating = Math.round((4.3 + Math.random() * 0.7) * 10) / 10; // 4.3 – 5.0
    const photoN = rand(99);
    const doc = db.collection('astrologers').doc(`ai_astro_${idx + 1}`);
    batch.set(doc, {
      name: p.full,
      isAI: true,
      profilePhoto: `https://randomuser.me/api/portraits/${p.isMale ? 'men' : 'women'}/${photoN}.jpg`,
      about: `${p.first} ${pick(ABOUT)}`,
      experience: 3 + rand(25),
      languages: sample(LANGS, 2 + rand(3)),
      expertise: sample(EXPERTISE, 2 + rand(2)),
      rating,
      totalReviews: 40 + rand(4000),
      totalConsultations: 100 + rand(20000),
      followers: 200 + rand(50000),
      responseTimeSec: 5 + rand(40),
      ratePerMinutePaise: AI_RATE_PAISE, // ₹9/min for every AI persona
      commissionPercent: AI_COMMISSION,  // 35% platform commission
      earnings: 0,
      pendingPayout: 0,
      onlineStatus: online,
      available: online,
      verified: true,
      featured: chance(0.2),
      accountStatus: 'approved',
      __seedAI: true,
      createdAt: Timestamp.fromMillis(Date.now() - rand(400) * 86_400_000),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (++n % 400 === 0) { /* batches stay well under the 500 limit here */ }
  });
  await batch.commit();
  console.log(`✓ Seeded ${people.length} AI astrologers (isAI: true, __seedAI: true).`);
}

async function clear() {
  const snap = await db.collection('astrologers').where('__seedAI', '==', true).get();
  if (snap.empty) { console.log('Nothing to clear.'); return; }
  let batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  console.log(`✓ Removed ${snap.size} seeded AI astrologers.`);
}

const mode = process.argv.includes('--clear') ? clear : seed;
mode().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
