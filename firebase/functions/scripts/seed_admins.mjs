/**
 * Create the three SUPER ADMIN accounts (Adrish, Vineet, Sanjay) for testing.
 *
 * Silent: the Admin SDK's createUser sends NO email/notification — the accounts
 * simply exist with the password below. Nobody is alerted; only you have the
 * credentials. Safe to run while the portal is still private.
 *
 *   node scripts/seed_admins.mjs 'MyStr0ng!Pass'  # create/reset with THIS password
 *   node scripts/seed_admins.mjs --clear          # disable + remove these admins
 *
 * SECURITY: there is no built-in default password — you must pass one. Never
 * commit a real password to this file or to any doc. Rotate immediately if a
 * password was ever shared or committed.
 *
 * Run from the firebase/functions folder (needs serviceAccountKey.json).
 * Each account gets: role=admin, adminRole=super, and an adminUsers/{uid}
 * profile (so the roster + "added by / approved by" attribution show real names).
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const ADMINS = [
  { name: 'Adrish', email: 'adrish@asktro.in', adminRole: 'super' },
  { name: 'Vineet', email: 'vineet@asktro.in', adminRole: 'super' },
  { name: 'Sanjay', email: 'sanjay@asktro.in', adminRole: 'super' },
  { name: 'Sachendra', email: 'sachendra@asktro.in', adminRole: 'ops' },
  { name: 'Neeraj', email: 'neeraj@asktro.in', adminRole: 'astrology' },
];
const ROLE_LABEL = { super: 'Super Admin', ops: 'Chief Operations', astrology: 'Chief Astrology' };

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'serviceAccountKey.json';
let svc;
try {
  svc = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch {
  console.error(`\nCould not read ${keyPath}. Run from firebase/functions with a service-account key.\n`);
  process.exit(1);
}
initializeApp({ credential: cert(svc) });
const auth = getAuth();
const db = getFirestore();

const clear = process.argv.includes('--clear');
const password = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;

// No hardcoded fallback: refuse to run (except --clear) without an explicit,
// reasonably strong password so a credential can never live in this repo again.
if (!clear && (!password || password.length < 10)) {
  console.error(
    '\nRefusing to run: pass a strong password (>=10 chars) as the first arg,\n' +
    "e.g.  node scripts/seed_admins.mjs 'MyStr0ng!Pass'\n" +
    'Never commit the password anywhere.\n',
  );
  process.exit(1);
}

async function findUid(email) {
  try { return (await auth.getUserByEmail(email)).uid; } catch { return null; }
}

async function run() {
  if (clear) {
    for (const a of ADMINS) {
      const uid = await findUid(a.email);
      if (!uid) { console.log(`- ${a.email}: not found`); continue; }
      try { await auth.deleteUser(uid); } catch { /* ignore */ }
      await db.collection('adminUsers').doc(uid).delete().catch(() => {});
      console.log(`✓ removed ${a.email}`);
    }
    return;
  }

  console.log('\nCreating super admins (no emails are sent):\n');
  for (const a of ADMINS) {
    let uid = await findUid(a.email);
    let created = false;
    if (!uid) {
      const u = await auth.createUser({ email: a.email, password, displayName: a.name });
      uid = u.uid;
      created = true;
    } else {
      // Existing account → actually ROTATE the password (the old code skipped
      // this, so a re-run never changed the credential). Also revoke live
      // sessions so the previous password's tokens stop working immediately.
      await auth.updateUser(uid, { password });
      await auth.revokeRefreshTokens(uid);
    }
    await auth.setCustomUserClaims(uid, { role: 'admin', adminRole: a.adminRole });
    await db.collection('adminUsers').doc(uid).set(
      { name: a.name, email: a.email, adminRole: a.adminRole, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    console.log(`✓ ${a.name.padEnd(10)} ${a.email.padEnd(24)} ${(ROLE_LABEL[a.adminRole] ?? a.adminRole).padEnd(18)} ${created ? '(new)' : '(updated)'}`);
  }
  console.log(`\nAll accounts share the login password: ${password}`);
  console.log('They send/receive no notifications. Sign in at the portal to test each role.\n');
}

run().then(() => process.exit(0)).catch((e) => { console.error('\nFailed:', e.message); process.exit(1); });
