/**
 * Create / rotate the admin accounts (3 super, 1 ops, 1 astrology).
 *
 * Silent: the Admin SDK's createUser/updateUser sends NO email/notification —
 * the accounts simply exist with the password you type. Nobody is alerted.
 *
 *   node scripts/seed_admins.mjs          # prompt (hidden) for a new password
 *   node scripts/seed_admins.mjs --clear  # disable + remove these admins
 *
 * SECURITY: no default password, and the password is read from a HIDDEN prompt
 * (never argv, shell history, or the screen) so a credential can never leak into
 * this repo, your history, or a chat log. Never commit a real password anywhere.
 * Rotate immediately if a password was ever shared or committed.
 *
 * Run from the firebase/functions folder (needs serviceAccountKey.json).
 * Each account gets: role=admin, its adminRole claim, and an adminUsers/{uid}
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
// Mark the admin emails verified (needed for 2FA enrollment) WITHOUT touching
// passwords — so we don't force another rotation just to enable 2FA.
const verifyOnly = process.argv.includes('--verify');

/** Read a line from the terminal with the typed characters hidden (no echo), so
 *  the password never lands in the shell history, argv, or the screen. */
function promptHidden(query) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(query);
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    const onData = (ch) => {
      const code = ch.charCodeAt(0);
      if (code === 13 || code === 10) {        // Enter
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(buf);
      } else if (code === 3) {                 // Ctrl-C
        process.stdout.write('\n');
        process.exit(1);
      } else if (code === 127 || code === 8) { // Backspace
        buf = buf.slice(0, -1);
      } else {
        buf += ch;
      }
    };
    stdin.on('data', onData);
  });
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

  if (verifyOnly) {
    console.log('\nMarking admin emails verified (no password change):\n');
    for (const a of ADMINS) {
      const uid = await findUid(a.email);
      if (!uid) { console.log(`- ${a.email}: not found`); continue; }
      await auth.updateUser(uid, { emailVerified: true });
      console.log(`✓ verified ${a.email}`);
    }
    console.log('\nDone. These accounts can now enrol two-factor at /security.\n');
    return;
  }

  // Password comes from a hidden prompt — never argv/history/screen.
  const password = await promptHidden('New admin password (hidden, min 10 chars): ');
  if (!password || password.length < 10) {
    console.error('\nRefusing to run: password must be at least 10 characters.\n');
    process.exit(1);
  }

  console.log('\nRotating admin accounts (no emails are sent):\n');
  for (const a of ADMINS) {
    let uid = await findUid(a.email);
    let created = false;
    if (!uid) {
      // emailVerified:true so the account can enroll TOTP 2FA (Firebase requires
      // a verified email). We own these mailboxes, so verifying them directly is
      // safe and avoids depending on inbound email deliverability.
      const u = await auth.createUser({ email: a.email, password, displayName: a.name, emailVerified: true });
      uid = u.uid;
      created = true;
    } else {
      // Existing account → rotate the password, mark verified (for 2FA), and
      // revoke live sessions so the old password's tokens stop working now.
      await auth.updateUser(uid, { password, emailVerified: true });
      await auth.revokeRefreshTokens(uid);
    }
    await auth.setCustomUserClaims(uid, { role: 'admin', adminRole: a.adminRole });
    await db.collection('adminUsers').doc(uid).set(
      { name: a.name, email: a.email, adminRole: a.adminRole, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    console.log(`✓ ${a.name.padEnd(10)} ${a.email.padEnd(24)} ${(ROLE_LABEL[a.adminRole] ?? a.adminRole).padEnd(18)} ${created ? '(new)' : '(rotated)'}`);
  }
  // NEVER print the password. You typed it; you know it.
  console.log('\nDone. All 5 accounts share the new password and their old sessions were revoked.');
  console.log('Sign in at the portal to confirm each role.\n');
}

run().then(() => process.exit(0)).catch((e) => { console.error('\nFailed:', e.message); process.exit(1); });
