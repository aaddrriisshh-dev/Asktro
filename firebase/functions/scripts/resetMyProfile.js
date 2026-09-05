/**
 * Test helper: reset ONE account's onboarding details so the app treats it as a
 * new user and runs the full v2 onboarding (login is kept; only the profile
 * essentials are cleared). The router gate then sends this account to profile
 * setup, which re-saves everything.
 *
 * Pass the account's phone in E.164 (+91XXXXXXXXXX):
 *   GOOGLE_APPLICATION_CREDENTIALS="$HOME/Projects/Asktro/firebase/functions/serviceAccountKey.json" \
 *     node scripts/resetMyProfile.js +91XXXXXXXXXX
 */
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();
const D = admin.firestore.FieldValue.delete();

const phone = process.argv[2];
if (!phone || !phone.startsWith('+')) {
  console.error('Usage: node scripts/resetMyProfile.js +91XXXXXXXXXX');
  process.exit(1);
}

(async () => {
  const snap = await db.collection('users').where('phone', '==', phone).get();
  if (snap.empty) {
    console.log('No user found with phone', phone);
    process.exit(0);
  }
  for (const doc of snap.docs) {
    console.log(`Resetting ${doc.id} (name was: ${doc.data().name || '—'})`);
    await doc.ref.update({
      name: '',
      gender: D,
      birthDateMs: D,
      birthTime: D,
      birthTimeKnown: D,
      birthPlace: D,
      birthLat: D,
      birthLng: D,
      relationshipStatus: D,
      languages: D,
      onboardingComplete: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  console.log('Done. Fully close and reopen the app — it will send you through onboarding.');
  process.exit(0);
})().catch((e) => {
  console.error('Reset failed:', e);
  process.exit(1);
});
