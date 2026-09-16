/**
 * Append " (AI)" to the display name of every AI astrologer (isAI == true), so
 * users can tell an AI persona apart at a glance — in the app, the "…has joined"
 * line, and the admin portal (all read the same `astrologers/{id}.name` field,
 * which stays editable in the portal afterwards).
 *
 *   node scripts/label_ai_astrologers.mjs         # dry run — prints old -> new
 *   node scripts/label_ai_astrologers.mjs --yes   # apply the changes
 *
 * Run from firebase/functions (needs serviceAccountKey.json or
 * GOOGLE_APPLICATION_CREDENTIALS pointing at the key).
 *
 * Safe to re-run: names already carrying an "AI" label are skipped (idempotent).
 * The tag goes at the END (never the front) so the AI still speaks its real name
 * and "(AI)" reads as a label, not part of the name. No app rebuild needed — the
 * app reads names live.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
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
const YES = process.argv.includes('--yes');

// Already-labelled? Skip if the name has "(AI)" or a standalone "AI" token.
const alreadyLabelled = (name) => /\(\s*ai\s*\)/i.test(name) || /\bAI\b/.test(name);

const run = async () => {
  const snap = await db.collection('astrologers').where('isAI', '==', true).get();
  if (snap.empty) {
    console.log('No AI astrologers (isAI == true) found.');
    return;
  }

  let planned = 0, skipped = 0;
  console.log(`Found ${snap.size} AI astrologer(s).\n`);
  for (const doc of snap.docs) {
    const a = doc.data();
    const name = String(a.name ?? '').trim();
    if (!name) { console.log(`(skip: no name) ${doc.id}`); skipped++; continue; }
    if (alreadyLabelled(name)) { console.log(`skip (already labelled): ${name}`); skipped++; continue; }

    const newName = `${name} (AI)`;
    console.log(`${name}  ->  ${newName}`);
    planned++;
    if (YES) {
      await doc.ref.update({ name: newName, updatedAt: FieldValue.serverTimestamp() });
    }
  }

  console.log(`\n${YES ? 'Updated' : 'Would update'} ${planned} name(s); skipped ${skipped}.`);
  if (!YES && planned > 0) console.log('Re-run with --yes to apply.');
};

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
