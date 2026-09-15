/**
 * EMULATOR-ONLY seed data for safe local testing of v3.
 *
 * SAFE BY CONSTRUCTION: this script hard-wires the LOCAL emulator hosts and uses
 * NO service-account credentials. With the emulator hosts set, the Admin SDK
 * talks only to the local emulator — it physically cannot reach or modify your
 * live Firebase project. If the emulator isn't running, it simply fails to
 * connect (it never falls back to live).
 *
 * Usage (from the firebase/functions folder, with the emulator already running):
 *   node scripts/seed_emulator.mjs
 *
 * Seeds: global config, a handful of AI astrologers, and recharge plans. Your
 * customer signup (welcome credit, profile, wallet) is created by the real
 * onCustomerSignup function when you sign up in the app against the emulator.
 */

// Point the Admin SDK at the local emulator BEFORE it connects. These being set
// is what guarantees writes go to the emulator and never to live.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

// No credentials on purpose. The real project id only keeps the namespace
// identical to what the app uses (the emulator runs in singleProjectMode).
initializeApp({ projectId: 'asktro-tech-provate-limited' });
const db = getFirestore();

// Extra guard: refuse to run unless the emulator env is actually set, so this
// can never be repurposed to hit live by accident.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to run: FIRESTORE_EMULATOR_HOST is not set.');
  process.exit(1);
}

const AI_RATE_PAISE = 900; // ₹9/min

// `tradition` sets the reading school. vedic/kp/etc. need a ProKerala birth
// chart; numerology needs only the birth date; tarot & vastu need neither — so
// tarot/vastu/numerology astrologers reply with just the Gemini key (handy for
// local testing without ProKerala keys).
const AI_ASTROLOGERS = [
  { id: 'ai_astro_1', name: 'Pandit Arjun Sharma', male: true, expertise: ['Vedic', 'Career'], tradition: 'vedic' },
  { id: 'ai_astro_2', name: 'Guru Meera Nair', male: false, expertise: ['Love', 'Marriage'], tradition: 'vedic' },
  { id: 'ai_astro_3', name: 'Acharya Rohan Das', male: true, expertise: ['Numerology', 'Finance'], tradition: 'numerology' },
  { id: 'ai_astro_4', name: 'Devi Ananya Iyer', male: false, expertise: ['Tarot', 'Health'], tradition: 'tarot' },
  { id: 'ai_astro_5', name: 'Shastri Vikram Rao', male: true, expertise: ['Kundli', 'Remedies'], tradition: 'vedic' },
  { id: 'ai_astro_6', name: 'Jyotish Kavya Menon', male: false, expertise: ['Vastu', 'Home'], tradition: 'vastu' },
];

async function seedConfig() {
  await db.doc('config/global').set({
    consultationPricePerMinutePaise: 900,
    minWalletToStartPaise: 1800,
    freeChatMinutes: 3,
    graceMinutes: 1,
    commissionPercent: 20,
    featureFlags: { voice: true, video: true, referrals: true, retention: false },
    // Enables the "Simulate payment (test)" dummy gateway. Safe: the dev tools
    // ALSO require the local emulator (FUNCTIONS_EMULATOR), so this flag does
    // nothing in production even if it somehow appeared there.
    devPaymentsEnabled: true,
    // TEST ONLY: force every AI tier to a Flash model so a FREE-tier Gemini key
    // (which can't run gemini-pro) still produces real readings locally.
    // Production uses the default (reading = gemini-pro-latest) for best quality.
    aiModels: { router: 'gemini-flash-lite-latest', filler: 'gemini-flash-latest', reading: 'gemini-flash-latest' },
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log('  ✓ config/global');
}

async function seedAstrologers() {
  const batch = db.batch();
  for (let i = 0; i < AI_ASTROLOGERS.length; i++) {
    const a = AI_ASTROLOGERS[i];
    batch.set(db.collection('astrologers').doc(a.id), {
      name: a.name,
      isAI: true,
      profilePhoto: `https://randomuser.me/api/portraits/${a.male ? 'men' : 'women'}/${(i + 10) % 99}.jpg`,
      about: `${a.name.split(' ').slice(-1)[0]} is a trusted Asktro astrologer here to guide you.`,
      experience: 8 + i,
      languages: ['Hindi', 'English'],
      expertise: a.expertise,
      // readFlavor() reads the tradition from a TOP-LEVEL field (or under
      // `persona`), so it must live here, not nested under `flavor`.
      tradition: a.tradition,
      rating: 4.6 + (i % 4) * 0.1,
      totalReviews: 500 + i * 137,
      totalConsultations: 2000 + i * 411,
      followers: 5000 + i * 900,
      responseTimeSec: 8 + i,
      ratePerMinutePaise: AI_RATE_PAISE,
      commissionPercent: 35,
      earnings: 0,
      pendingPayout: 0,
      onlineStatus: true,
      available: true,
      verified: true,
      active: true,
      featured: i < 2,
      accountStatus: 'approved',
      __seedEmu: true,
      createdAt: Timestamp.fromMillis(Date.now() - i * 86_400_000),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  console.log(`  ✓ ${AI_ASTROLOGERS.length} AI astrologers`);
}

async function seedRechargePlans() {
  const rupees = [100, 200, 500, 1000, 2000];
  const batch = db.batch();
  rupees.forEach((r, idx) => {
    batch.set(db.collection('rechargePlans').doc(`rp_${r}`), {
      amount: r * 100,
      walletCredit: r * 100,
      bonus: 0,
      popular: r === 500,
      recommended: r === 200,
      displayOrder: idx + 1,
      active: true,
    });
  });
  await batch.commit();
  console.log(`  ✓ ${rupees.length} recharge plans`);
}

async function main() {
  console.log(`Seeding EMULATOR at ${process.env.FIRESTORE_EMULATOR_HOST} …`);
  await seedConfig();
  await seedAstrologers();
  await seedRechargePlans();
  console.log('\nDone. Practice data is in the local emulator only.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
