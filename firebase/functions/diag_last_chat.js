/**
 * Diagnostic: dump the most recent consultation + its messages + the customer's
 * balances, so we can see exactly what billing did on the last AI chat.
 *
 * Run on the Mac (has the service-account key):
 *   cd ~/Projects/Asktro/firebase/functions && node diag_last_chat.js
 *
 * Optional: pass a consultationId to inspect a specific one:
 *   node diag_last_chat.js <consultationId>
 *
 * Not deployed (excluded via .gcloudignore).
 */
const path = require('path');
const admin = require('firebase-admin');

process.env.GOOGLE_APPLICATION_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'serviceAccountKey.json');

admin.initializeApp({ projectId: 'asktro-tech-provate-limited' });
const db = admin.firestore();

const fmt = (v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v);
const rupees = (paise) => (typeof paise === 'number' ? `₹${(paise / 100).toFixed(2)} (${paise}p)` : paise);

(async () => {
  const arg = process.argv[2];
  let doc;
  if (arg) {
    doc = await db.collection('consultations').doc(arg).get();
    if (!doc.exists) { console.log('No consultation with id', arg); process.exit(0); }
  } else {
    const snap = await db.collection('consultations').orderBy('createdAt', 'desc').limit(1).get();
    if (snap.empty) { console.log('No consultations found.'); process.exit(0); }
    doc = snap.docs[0];
  }
  const c = doc.data();

  console.log('\n=== CONSULTATION', doc.id, '===');
  console.log('isAI              ', c.isAI);
  console.log('type              ', c.type);
  console.log('status            ', c.status);
  console.log('createdAt         ', fmt(c.createdAt));
  console.log('startTime         ', fmt(c.startTime), '  <- when billing started');
  console.log('endTime           ', fmt(c.endTime));
  console.log('lastTickAt        ', fmt(c.lastTickAt));
  console.log('customerLastTickAt', fmt(c.customerLastTickAt));
  console.log('pricePerMinute    ', rupees(c.pricePerMinute));
  console.log('billedSeconds     ', c.billedSeconds);
  console.log('duration          ', c.duration);
  console.log('totalCharged      ', rupees(c.totalCharged), '  <- money actually charged');
  console.log('walletBefore      ', rupees(c.walletBefore));
  console.log('walletAfter       ', rupees(c.walletAfter));
  console.log('chatCreditEligible', c.chatCreditEligible, '  <- can use the free 3-min credit');
  console.log('pausedAccumMs     ', c.pausedAccumMs);
  console.log('warnLevel         ', c.warnLevel, '  remainingSec', c.remainingSec);

  const u = (await db.collection('users').doc(c.customerId).get()).data() || {};
  console.log('\n=== CUSTOMER', c.customerId, 'BALANCES NOW ===');
  console.log('walletBalance     ', rupees(u.walletBalance));
  console.log('bonusBalance      ', rupees(u.bonusBalance));
  console.log('chatBonusBalance  ', rupees(u.chatBonusBalance), '  <- free 3-min credit remaining');
  console.log('signupBonusGranted', u.signupBonusGranted);

  const msgs = await doc.ref.collection('messages').orderBy('timestamp', 'asc').get();
  console.log('\n=== MESSAGES (', msgs.size, ') ===');
  msgs.forEach((m) => {
    const d = m.data();
    const who = d.senderId === c.astrologerId ? 'AI ' : 'USR';
    const body = String(d.text || d.image || '').replace(/\s+/g, ' ').slice(0, 70);
    console.log(who, fmt(d.timestamp), (d.type || 'text').padEnd(6), body);
  });

  console.log('\nInterpretation: if totalCharged is 0 but chatBonusBalance dropped, the free');
  console.log('credit covered it (correct). If billedSeconds is 0 with real conversation,');
  console.log('billing did not run — that would be the bug.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
