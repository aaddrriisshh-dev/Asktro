/**
 * List every AI astrologer (isAI == true) with its live display name, in a
 * copy-paste-and-edit format for a bulk rename.
 *
 *   node scripts/list_ai_astrologers.mjs
 *
 * Run from firebase/functions (needs serviceAccountKey.json or
 * GOOGLE_APPLICATION_CREDENTIALS pointing at the key). READ-ONLY — it never
 * changes anything.
 *
 * Output is one line per astrologer:
 *
 *     <id> | Current Name (AI)
 *
 * To rename: keep the "<id> |" part EXACTLY as-is and change only the text
 * AFTER the "|" to the new name you want (drop the "(AI)", shorten it, etc.).
 * Send the whole edited block back and it becomes a one-command rename.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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

const run = async () => {
  const snap = await db.collection('astrologers').where('isAI', '==', true).get();
  if (snap.empty) {
    console.log('No AI astrologers (isAI == true) found.');
    return;
  }

  const rows = snap.docs
    .map((d) => ({ id: d.id, name: String(d.data().name ?? '').trim() }))
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log(`\nFound ${rows.length} AI astrologer(s). Edit ONLY the text after each "|":\n`);
  console.log('----- COPY FROM HERE -----');
  for (const r of rows) console.log(`${r.id} | ${r.name}`);
  console.log('----- TO HERE -----\n');
};

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
