/**
 * One-off cleanup before the v2 paid launch: zero the LEGACY free-chat credit.
 *
 * In free-v1 we set config.freeChatMinutes = 999999, so onUserCreate granted a
 * huge `chatBonusBalance` (and some `bonusBalance`) to every account. With v2's
 * wallet now visible and human consults paid, that leftover non-real credit would
 * (a) look like a giant wallet balance, and (b) be spendable on base-rate human
 * chats. This resets it so every existing user starts clean, exactly like a new
 * v2 signup.
 *
 * SAFETY: it does NOT touch `walletBalance` (real recharged money) — and in v1
 * nobody could recharge, so that's 0 anyway. It only clears the free bonus buckets.
 *
 * Run on the Mac (needs the Google key), from firebase/functions:
 *   GOOGLE_APPLICATION_CREDENTIALS="$HOME/Projects/Asktro/firebase/functions/serviceAccountKey.json" \
 *     node scripts/resetLegacyBonus.js
 */
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

(async () => {
  const snap = await db.collection('users').get();
  if (snap.empty) {
    console.log('No users found.');
    process.exit(0);
  }

  let scanned = 0;
  let cleared = 0;
  let batch = db.batch();
  let inBatch = 0;

  for (const doc of snap.docs) {
    scanned += 1;
    const u = doc.data();
    const chat = u.chatBonusBalance || 0;
    const bonus = u.bonusBalance || 0;
    if (chat === 0 && bonus === 0) continue; // already clean

    console.log(
      `- ${doc.id} | name=${(u.name || '').toString().slice(0, 16)} ` +
        `chatBonus=${chat} bonus=${bonus} wallet=${u.walletBalance || 0} (kept)`,
    );
    batch.update(doc.ref, {
      chatBonusBalance: 0,
      bonusBalance: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    cleared += 1;
    inBatch += 1;
    if (inBatch === 400) {
      await batch.commit();
      batch = db.batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) await batch.commit();

  console.log(`\nDone. Scanned ${scanned} users, cleared legacy bonus on ${cleared}.`);
  console.log('walletBalance (real money) was left untouched.');
  process.exit(0);
})().catch((e) => {
  console.error('Reset failed:', e);
  process.exit(1);
});
