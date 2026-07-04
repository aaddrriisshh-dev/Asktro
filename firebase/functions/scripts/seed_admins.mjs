/**
 * Create the three SUPER ADMIN accounts (Adrish, Vineet, Sanjay) for testing.
 *
 * Silent: the Admin SDK's createUser sends NO email/notification — the accounts
 * simply exist with the password below. Nobody is alerted; only you have the
 * credentials. Safe to run while the portal is still private.
 *
 *   node scripts/seed_admins.mjs                 # create with the default password
 *   node scripts/seed_admins.mjs MyPass123       # create with a custom password
 *   node scripts/seed_admins.mjs --clear         # disable + remove these 3 admins
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
  { name: 'Adrish', email: 'adrish@asktro.in' },
  { name: 'Vineet', email: 'vineet@asktro.in' },
  { name: 'Sanjay', email: 'sanjay@asktro.in' },
];
const DEFAULT_PASSWORD = 'Asktro@2026';

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
const password = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : DEFAULT_PASSWORD;

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
    }
    await auth.setCustomUserClaims(uid, { role: 'admin', adminRole: 'super' });
    await db.collection('adminUsers').doc(uid).set(
      { name: a.name, email: a.email, adminRole: 'super', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    console.log(`✓ ${a.name.padEnd(7)} ${a.email.padEnd(22)} ${created ? '(new)' : '(updated)'}`);
  }
  console.log(`\nAll three are SUPER ADMINS. Shared login password: ${password}`);
  console.log('They send/receive no notifications. Sign in at the portal to test each one.\n');
}

run().then(() => process.exit(0)).catch((e) => { console.error('\nFailed:', e.message); process.exit(1); });
