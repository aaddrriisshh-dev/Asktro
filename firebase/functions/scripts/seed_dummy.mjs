/**
 * Seed the Firestore database with realistic DUMMY data so the admin dashboard
 * cards light up with live-looking numbers, charts and tables.
 *
 * Every document written here is tagged  { __seed: true }  so you can remove all
 * of it in one shot when you're done reviewing:
 *
 *   node scripts/seed_dummy.mjs            # insert dummy data
 *   node scripts/seed_dummy.mjs --clear    # delete everything this script made
 *
 * Prereqs (same as set_admin.mjs):
 *   A service-account key at firebase/functions/serviceAccountKey.json
 *   (Firebase Console -> Project settings -> Service accounts -> Generate key).
 *   This file is gitignored — never commit it.
 *
 * Run from inside the firebase/functions folder.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

// ---- auth -----------------------------------------------------------------
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'serviceAccountKey.json';
let svc;
try {
  svc = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch {
  console.error(
    `\nCould not read ${keyPath}.\n` +
      'Download it from Firebase Console -> Project settings -> Service accounts ->\n' +
      '"Generate new private key", save it as firebase/functions/serviceAccountKey.json,\n' +
      'and run this from inside the firebase/functions folder.\n',
  );
  process.exit(1);
}
initializeApp({ credential: cert(svc) });
const db = getFirestore();

// ---- collections we touch --------------------------------------------------
const COLLECTIONS = [
  'users',
  'astrologers',
  'walletTransactions',
  'consultations',
  'payouts',
  'supportTickets',
];

// ---- tiny random helpers ---------------------------------------------------
const DAY = 86_400_000;
const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const chance = (p) => Math.random() < p;
// A Timestamp `daysAgo` days back (with a random time-of-day), always in the past.
function tsDaysAgo(daysAgo) {
  const ms = Date.now() - daysAgo * DAY - rand(DAY);
  return Timestamp.fromMillis(ms);
}

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan',
  'Ananya', 'Diya', 'Aadhya', 'Saanvi', 'Pari', 'Anika', 'Navya', 'Myra', 'Sara', 'Aisha',
  'Kabir', 'Aryan', 'Dhruv', 'Kiaan', 'Neha', 'Priya', 'Riya', 'Meera', 'Kavya', 'Tara'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Iyer', 'Nair', 'Reddy', 'Rao', 'Patel', 'Singh', 'Das',
  'Bose', 'Menon', 'Kapoor', 'Malhotra', 'Chopra', 'Joshi'];
const LANGS = ['Hindi', 'English', 'Tamil', 'Telugu', 'Bengali', 'Marathi', 'Kannada', 'Punjabi'];
const EXPERTISE = ['Vedic', 'Numerology', 'Tarot', 'Palmistry', 'Vastu', 'KP System', 'Nadi', 'Lal Kitab'];
const SUBJECTS = ['Payment not credited', 'Astrologer was rude', 'Call disconnected', 'Refund request',
  'Wrong prediction', 'App keeps crashing', 'Cannot recharge', 'Bonus not applied'];
const RECHARGE_PAISE = [10000, 20000, 50000, 75000, 100000, 200000, 300000, 500000]; // ₹100–₹5000
const CONS_TYPES = ['chat', 'voice', 'video'];

// ---------------------------------------------------------------------------
async function clearSeed() {
  console.log('Clearing previously-seeded dummy data…');
  let total = 0;
  for (const col of COLLECTIONS) {
    const snap = await db.collection(col).where('__seed', '==', true).get();
    // batch deletes in chunks of 400
    let batch = db.batch();
    let n = 0;
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      n += 1;
      total += 1;
      if (n % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    if (n % 400 !== 0) await batch.commit();
    console.log(`  ${col}: removed ${snap.size}`);
  }
  console.log(`\n✓ Removed ${total} dummy documents.\n`);
}

async function seed() {
  console.log('Seeding dummy data…\n');

  // -- 1) Astrologers -------------------------------------------------------
  const astrologers = [];
  const ASTRO_COUNT = 14;
  for (let i = 0; i < ASTRO_COUNT; i++) {
    const gender = i < 8 ? 'male' : 'female';
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    // most approved & some online; a couple pending to exercise the approval flow
    const accountStatus = i < 11 ? 'approved' : chance(0.5) ? 'pending' : 'approved';
    const online = accountStatus === 'approved' && chance(0.6);
    const earnings = rand(80) * 10000; // up to ₹8,000
    const pendingPayout = chance(0.5) ? rand(30) * 10000 : 0;
    const ref = db.collection('astrologers').doc();
    astrologers.push({ id: ref.id, gender, name });
    await ref.set({
      __seed: true,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}.${i}@astro.dummy`,
      phone: `+9198${String(76000000 + rand(999999)).padStart(8, '0')}`,
      gender,
      about: 'Experienced astrologer specialising in life, career and relationship guidance.',
      experience: 2 + rand(20),
      languages: [pick(LANGS), pick(LANGS)],
      expertise: [pick(EXPERTISE), pick(EXPERTISE)],
      ratePerMinutePaise: pick([1500, 2000, 2500, 3000, 4000]),
      rating: Number((3.6 + Math.random() * 1.4).toFixed(1)),
      totalReviews: rand(500),
      totalConsultations: rand(1200),
      earnings,
      pendingPayout,
      onlineStatus: online,
      available: online,
      verified: accountStatus === 'approved',
      featured: chance(0.25),
      accountStatus,
      createdAt: tsDaysAgo(30 + rand(120)),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  console.log(`  astrologers: ${astrologers.length} (${astrologers.filter((a) => a.gender === 'male').length} male / ${astrologers.filter((a) => a.gender === 'female').length} female)`);

  // -- 2) Users + their wallet ledger --------------------------------------
  const users = [];
  const USER_COUNT = 55;
  let rechargeTxns = 0;
  for (let i = 0; i < USER_COUNT; i++) {
    const gender = chance(0.55) ? 'male' : 'female';
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const createdAt = tsDaysAgo(rand(30)); // registered within the last 30 days
    const paid = chance(0.6); // ~60% have recharged at least once
    const uref = db.collection('users').doc();
    users.push({ id: uref.id, paid, name });

    let balance = 0;
    let totalRecharge = 0;
    let totalSpent = 0;
    let firstRechargeAt = null;

    if (paid) {
      const nRecharges = 1 + rand(4);
      // recharges land on/after the signup date, spread through the period
      for (let r = 0; r < nRecharges; r++) {
        const amt = pick(RECHARGE_PAISE);
        const daysAgo = rand(30);
        const when = tsDaysAgo(daysAgo);
        const before = balance;
        balance += amt;
        totalRecharge += amt;
        if (!firstRechargeAt || when.toMillis() < firstRechargeAt.toMillis()) firstRechargeAt = when;
        await db.collection('walletTransactions').add({
          __seed: true,
          userId: uref.id,
          kind: 'recharge',
          amount: amt,
          balanceBefore: before,
          balanceAfter: balance,
          refId: `dummy_pay_${i}_${r}`,
          note: 'Wallet recharge',
          createdAt: when,
        });
        rechargeTxns += 1;

        // an occasional signup bonus
        if (r === 0 && chance(0.4)) {
          const bonus = pick([5000, 10000, 2500]);
          await db.collection('walletTransactions').add({
            __seed: true, userId: uref.id, kind: 'bonus', amount: bonus,
            balanceBefore: balance, balanceAfter: balance + bonus,
            refId: null, note: 'Welcome bonus', createdAt: when,
          });
          balance += bonus;
        }

        // an occasional consultation debit after a recharge
        if (chance(0.5)) {
          const spend = Math.min(balance, pick([3000, 5000, 8000, 12000]));
          if (spend > 0) {
            const before2 = balance;
            balance -= spend;
            totalSpent += spend;
            await db.collection('walletTransactions').add({
              __seed: true, userId: uref.id, kind: 'consultation', amount: -spend,
              balanceBefore: before2, balanceAfter: balance,
              refId: `dummy_cons_${i}_${r}`, note: 'Consultation charge',
              createdAt: tsDaysAgo(Math.max(0, daysAgo - 1)),
            });
          }
        }
      }

      // a rare refund so the Refunds metric isn't always ₹0
      if (chance(0.12)) {
        const refund = pick([3000, 5000]);
        await db.collection('walletTransactions').add({
          __seed: true, userId: uref.id, kind: 'refund', amount: refund,
          balanceBefore: balance, balanceAfter: balance + refund,
          refId: null, note: 'Goodwill refund', createdAt: tsDaysAgo(rand(20)),
        });
        balance += refund;
      }
    }

    await uref.set({
      __seed: true,
      name,
      phone: `+9199${String(10000000 + rand(9999999)).padStart(8, '0')}`,
      email: chance(0.5) ? `${name.toLowerCase().replace(/\s+/g, '')}@mail.dummy` : '',
      gender,
      walletBalance: balance,
      bonusBalance: 0,
      lockedBalance: 0,
      totalRecharge,
      totalSpent,
      pendingRefund: 0,
      totalConsultations: paid ? rand(8) : 0,
      referralCode: `ASK${String(1000 + i)}`,
      accountStatus: chance(0.95) ? 'active' : 'blocked',
      firstRechargeAt,
      createdAt,
    });
  }
  const paidCount = users.filter((u) => u.paid).length;
  console.log(`  users: ${users.length} (${paidCount} paid / ${users.length - paidCount} unpaid)`);
  console.log(`  walletTransactions: ${rechargeTxns} recharges (+ bonuses/consultations/refunds)`);

  // -- 3) Consultations (some active for the Live table) --------------------
  let activeCount = 0;
  const CONS_COUNT = 22;
  for (let i = 0; i < CONS_COUNT; i++) {
    const isActive = i < 6; // first six are in-progress right now
    if (isActive) activeCount += 1;
    const astro = pick(astrologers);
    const cust = pick(users);
    const type = pick(CONS_TYPES);
    const perMin = pick([1500, 2000, 2500, 3000]);
    const billedSeconds = isActive ? 30 + rand(600) : 60 + rand(1800);
    const totalCharged = Math.round((billedSeconds / 60) * perMin);
    await db.collection('consultations').add({
      __seed: true,
      customerId: cust.id,
      astrologerId: astro.id,
      type,
      pricePerMinute: perMin,
      pricePerSecond: perMin / 60,
      status: isActive ? 'active' : pick(['completed', 'completed', 'cancelled']),
      paymentStatus: isActive ? 'pending' : 'settled',
      networkStatus: 'ok',
      startTime: tsDaysAgo(isActive ? 0 : rand(30)),
      endTime: isActive ? null : tsDaysAgo(rand(30)),
      billedSeconds,
      duration: billedSeconds,
      totalCharged,
      warnLevel: 0,
      remainingSec: isActive ? 120 + rand(600) : 0,
      rating: isActive ? null : pick([4, 5, 5, 3, null]),
      createdAt: tsDaysAgo(isActive ? 0 : rand(30)),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  console.log(`  consultations: ${CONS_COUNT} (${activeCount} active)`);

  // -- 4) Payouts -----------------------------------------------------------
  const PAYOUT_COUNT = 12;
  for (let i = 0; i < PAYOUT_COUNT; i++) {
    const astro = pick(astrologers);
    await db.collection('payouts').add({
      __seed: true,
      astrologerId: astro.id,
      astrologerName: astro.name,
      amount: (5 + rand(60)) * 10000, // ₹500–₹6,500
      method: pick(['UPI', 'Bank Transfer', 'UPI', 'IMPS']),
      status: i < 7 ? 'pending' : 'approved',
      createdAt: tsDaysAgo(rand(30)),
    });
  }
  console.log(`  payouts: ${PAYOUT_COUNT} (7 pending / 5 approved)`);

  // -- 5) Support tickets ---------------------------------------------------
  const MESSAGES = {
    'Payment not credited': 'I recharged ₹500 through UPI but the amount never showed up in my wallet. The money was debited from my bank. Please credit it or refund me.',
    'Astrologer was rude': 'The astrologer I consulted was dismissive and rude during my call. I felt disrespected and want this looked into.',
    'Call disconnected': 'My voice call kept disconnecting after 2 minutes but I was still charged for the full session. Please review the billing.',
    'Refund request': 'I was charged twice for the same consultation. Requesting a refund for the duplicate charge at the earliest.',
    'Wrong prediction': 'The prediction I received was completely off and the astrologer seemed unsure. Can I get a partial refund?',
    'App keeps crashing': 'The app crashes every time I try to open the chat screen on my Android phone. I cannot start any consultation.',
    'Cannot recharge': 'Every time I try to recharge, the payment page fails to load. I have tried UPI and card both. Please help.',
    'Bonus not applied': 'The ₹100 bonus on ₹100 recharge offer was not applied to my wallet. I only see the base amount.',
  };
  const TICKET_COUNT = 13;
  let openTickets = 0;
  for (let i = 0; i < TICKET_COUNT; i++) {
    const open = i < 8;
    if (open) openTickets += 1;
    const fromAstro = chance(0.3);
    const who = fromAstro ? pick(astrologers) : pick(users);
    const subject = pick(SUBJECTS);
    await db.collection('supportTickets').add({
      __seed: true,
      ticketNo: `ASK-TKT-${String(100000 + i)}`,
      customerId: fromAstro ? null : who.id,
      astrologerId: fromAstro ? who.id : null,
      userName: who.name,
      subject,
      message: MESSAGES[subject] ?? 'Please help me resolve my issue as soon as possible.',
      thread: [],
      status: open ? 'open' : 'closed',
      priority: pick(['low', 'normal', 'high']),
      createdAt: tsDaysAgo(rand(30)),
    });
  }
  console.log(`  supportTickets: ${TICKET_COUNT} (${openTickets} open)`);

  console.log('\n✓ Dummy data seeded. Open the admin dashboard and refresh.');
  console.log('  To remove it all later:  node scripts/seed_dummy.mjs --clear\n');
}

// ---------------------------------------------------------------------------
const mode = process.argv[2];
try {
  if (mode === '--clear') await clearSeed();
  else await seed();
  process.exit(0);
} catch (e) {
  console.error('\nFailed:', e.message, '\n');
  process.exit(1);
}
