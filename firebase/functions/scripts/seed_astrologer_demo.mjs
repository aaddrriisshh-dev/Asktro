/**
 * Seed realistic demo data for ONE astrologer so every screen in the astrologer
 * app can be verified end-to-end (dashboard metrics, New/Ongoing/Completed
 * consultations, details + birth data + kundli, transcripts, wallet, payouts,
 * notifications).
 *
 *   node scripts/seed_astrologer_demo.mjs <astrologer-email>
 *   node scripts/seed_astrologer_demo.mjs <astrologer-email> --clear
 *
 * Everything created is tagged { __demo: true } so --clear removes only this.
 * Run from firebase/functions (needs serviceAccountKey.json).
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
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

const email = process.argv[2];
const CLEAR = process.argv.includes('--clear');
if (!email || email.startsWith('--')) {
  console.error('\nUsage: node scripts/seed_astrologer_demo.mjs <astrologer-email> [--clear]\n');
  process.exit(1);
}

const DAY = 86_400_000;
const ago = (ms) => Timestamp.fromMillis(Date.now() - ms);

// ---- demo customers (real birth details so kundli + details screens fill) ----
const CUSTOMERS = [
  { id: 'demo_cust_1', name: 'Rohan Mehta', gender: 'male', birth: '1996-08-14', time: '06:15', place: 'Mumbai, MH, India',
    langs: ['Hindi', 'English'], rel: 'single', men: 12 },
  { id: 'demo_cust_2', name: 'Priya Sharma', gender: 'female', birth: '1993-02-03', time: '21:40', place: 'Delhi, India',
    langs: ['Hindi'], rel: 'married', women: 45 },
  { id: 'demo_cust_3', name: 'Amit Verma', gender: 'male', birth: '1988-11-27', time: '', place: 'Bengaluru, KA, India',
    langs: ['English', 'Kannada'], rel: 'in_relationship', men: 33 },
];

function photo(c) {
  if (c.men != null) return `https://randomuser.me/api/portraits/men/${c.men}.jpg`;
  return `https://randomuser.me/api/portraits/women/${c.women}.jpg`;
}

async function findAstrologer() {
  const snap = await db.collection('astrologers').where('email', '==', email).limit(1).get();
  if (snap.empty) {
    console.error(`\nNo astrologer found with email ${email}. Add one in the portal first.\n`);
    process.exit(1);
  }
  return { id: snap.docs[0].id, data: snap.docs[0].data() };
}

async function clear(astroId) {
  let n = 0;
  for (const coll of ['consultations', 'notifications', 'payouts']) {
    const q = await db.collection(coll).where('__demo', '==', true).where(
      coll === 'notifications' ? 'userId' : 'astrologerId', '==', astroId,
    ).get().catch(() => db.collection(coll).where('__demo', '==', true).get());
    for (const d of q.docs) { await d.ref.delete(); n++; }
  }
  for (const c of CUSTOMERS) { await db.collection('users').doc(c.id).delete().catch(() => {}); }
  console.log(`✓ Cleared ${n} demo docs + ${CUSTOMERS.length} demo customers.`);
}

async function seed(astro) {
  const astroId = astro.id;
  const rate = astro.data.ratePerMinutePaise || 900;

  // customers
  for (const c of CUSTOMERS) {
    await db.collection('users').doc(c.id).set({
      name: c.name,
      gender: c.gender,
      birthDateMs: new Date(c.birth + 'T00:00:00Z').getTime(),
      birthTime: c.time,
      birthTimeKnown: c.time !== '',
      birthPlace: c.place,
      languages: c.langs,
      relationshipStatus: c.rel,
      profilePhoto: photo(c),
      phone: '+9198765' + String(10000 + Math.floor(Math.random() * 89999)),
      accountStatus: 'active',
      walletBalance: 50000,
      __demo: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  const types = ['chat', 'voice', 'video'];
  const mk = (over) => ({
    astrologerId: astroId,
    pricePerMinute: rate,
    walletAfter: 0,
    remainingSec: 0,
    warnLevel: 0,
    graceGranted: false,
    __demo: true,
    ...over,
  });

  const batchDocs = [];

  // 2 NEW (waiting) — fresh requests
  batchDocs.push(mk({ customerId: 'demo_cust_1', type: 'chat', status: 'waiting', createdAt: ago(2 * 60000) }));
  batchDocs.push(mk({ customerId: 'demo_cust_2', type: 'voice', status: 'waiting', createdAt: ago(6 * 60000) }));

  // 1 ONGOING (active)
  batchDocs.push(mk({
    customerId: 'demo_cust_3', type: 'chat', status: 'active',
    billedSeconds: 320, totalCharged: Math.round((320 / 60) * rate),
    startTimeMs: Date.now() - 320000, createdAt: ago(6 * 60000),
  }));

  // COMPLETED — spread across the last 6 days (drives today/week/month + charts)
  const completed = [
    { cust: 'demo_cust_1', type: 'chat', mins: 24, day: 0, rating: 5 },
    { cust: 'demo_cust_2', type: 'voice', mins: 18, day: 0, rating: 4 },
    { cust: 'demo_cust_1', type: 'chat', mins: 12, day: 1, rating: 5 },
    { cust: 'demo_cust_3', type: 'video', mins: 31, day: 2, rating: 5 },
    { cust: 'demo_cust_2', type: 'chat', mins: 9, day: 4, rating: 4 },
    { cust: 'demo_cust_3', type: 'chat', mins: 21, day: 5, rating: 5 },
  ];
  const completedRefs = [];
  for (const s of completed) {
    const secs = s.mins * 60;
    const doc = db.collection('consultations').doc();
    completedRefs.push({ ref: doc, cust: s.cust });
    await doc.set(mk({
      customerId: s.cust, type: s.type, status: 'completed',
      billedSeconds: secs, duration: secs, totalCharged: Math.round((secs / 60) * rate),
      rating: s.rating, receiptNo: 'ASK' + Math.floor(100000 + Math.random() * 899999),
      createdAt: ago(s.day * DAY + 3 * 3600000),
      endTimeMs: Date.now() - (s.day * DAY),
    }));
  }

  // remaining waiting/active docs
  for (const d of batchDocs) { await db.collection('consultations').add(d); }

  // a few messages on the two most recent completed chats (for transcripts)
  const convo = [
    { from: 'cust', text: 'Namaste Guruji, I wanted to ask about my career.' },
    { from: 'astro', text: 'Namaste 🙏 Please share your concern in detail.' },
    { from: 'cust', text: 'I changed my job 6 months back but not getting growth.' },
    { from: 'astro', text: 'Your Moon is strong right now — a good window for a decisive move.' },
  ];
  for (const cr of completedRefs.slice(0, 2)) {
    let t = Date.now() - 3 * DAY;
    for (const m of convo) {
      t += 60000;
      await cr.ref.collection('messages').add({
        senderId: m.from === 'astro' ? astroId : cr.cust,
        type: 'text', text: m.text,
        timestamp: Timestamp.fromMillis(t), delivered: true, seen: true,
      });
    }
  }

  // notifications
  const notifs = [
    { type: 'consultation', title: 'New consultation request', body: 'Rohan Mehta wants a chat consultation.', ms: 2 * 60000, read: false },
    { type: 'payment', title: 'Payment received', body: '₹210 added to your wallet.', ms: 10 * 60000, read: false },
    { type: 'review', title: 'New 5★ review', body: 'Priya Sharma rated your consultation 5 stars.', ms: 3 * 3600000, read: true },
    { type: 'withdrawal', title: 'Withdrawal processed', body: '₹5,000 transferred to your UPI.', ms: 1 * DAY, read: true },
    { type: 'announcement', title: 'Platform update', body: 'New celestial home — take a look!', ms: 2 * DAY, read: true },
  ];
  for (const n of notifs) {
    await db.collection('notifications').add({
      userId: astroId, type: n.type, title: n.title, body: n.body, read: n.read,
      __demo: true, createdAt: ago(n.ms),
    });
  }

  // one processed payout for wallet history
  await db.collection('payouts').add({
    astrologerId: astroId, astrologerName: astro.data.name || 'Astrologer',
    amount: 500000, method: 'upi', upi: 'astro@upi', status: 'processed',
    __demo: true, createdAt: ago(3 * DAY),
  });

  // roll up the astrologer's own headline stats
  const lifetime = completed.reduce((a, s) => a + Math.round((s.mins * 60 / 60) * rate), 0) + 500000;
  await db.collection('astrologers').doc(astroId).set({
    earnings: lifetime,
    pendingPayout: 682000,
    rating: 4.9,
    totalReviews: 1280,
    totalConsultations: 1240,
    responseTimeSec: 45,
    onlineStatus: true,
    available: true,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`\n✓ Seeded demo data for ${astro.data.name} (${email}).`);
  console.log('  • 3 customers with birth details');
  console.log('  • 2 New · 1 Ongoing · 6 Completed consultations (+ transcripts)');
  console.log('  • 5 notifications · 1 payout · earnings/rating/response filled');
  console.log('\nOpen the astrologer app and pull-to-refresh the Home tab.\n');
}

const astro = await findAstrologer();
if (CLEAR) {
  await clear(astro.id);
} else {
  await seed(astro);
}
process.exit(0);
