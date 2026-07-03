// One-time bootstrap: grant SUPER ADMIN to an existing Firebase Auth user, so
// they can sign into the admin portal (which requires the `role: admin` claim).
//
// Prereqs:
//   1) The user already exists in Firebase Auth (create them in the console:
//      Authentication -> Users -> Add user).
//   2) A service-account key saved as firebase/functions/serviceAccountKey.json
//      (Firebase Console -> Project settings -> Service accounts ->
//       Generate new private key). This file is gitignored — never commit it.
//
// Run from the firebase/functions folder:
//   node scripts/set_admin.mjs you@example.com
//
// After it runs, sign out and back in to the portal for the role to take effect.
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/set_admin.mjs <email>');
  process.exit(1);
}

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

try {
  const user = await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid, { role: 'admin', adminRole: 'super' });
  console.log(`\n✓ ${email} is now a SUPER ADMIN (uid ${user.uid}).`);
  console.log('Sign out and sign back in to the portal for it to take effect.\n');
} catch (e) {
  console.error('\nFailed:', e.message);
  console.error('Make sure the user exists first (Firebase Console -> Authentication -> Users -> Add user).\n');
  process.exit(1);
}
process.exit(0);
