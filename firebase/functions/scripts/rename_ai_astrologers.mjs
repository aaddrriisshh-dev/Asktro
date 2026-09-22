/**
 * De-bracket AI astrologer names: turn a trailing "(AI)" into a plain " AI"
 * (no brackets), e.g. "Acharya Vidyanath Shastri (AI)" -> "Acharya Vidyanath
 * Shastri AI". Runs over every isAI == true astrologer.
 *
 *   node scripts/rename_ai_astrologers.mjs         # dry run — prints old -> new
 *   node scripts/rename_ai_astrologers.mjs --yes   # apply the changes
 *
 * Run from firebase/functions (needs serviceAccountKey.json or
 * GOOGLE_APPLICATION_CREDENTIALS pointing at the key).
 *
 * Names are read LIVE by the app and portal (astrologers/{id}.name), so this
 * takes effect instantly — no app rebuild, no function redeploy. Safe to re-run
 * (a name with no "(AI)" brackets is left untouched).
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

// "Anything (AI) anything" -> the brackets are removed, "AI" kept as a plain
// word; surrounding whitespace is normalised so we never leave a double space.
const debracket = (name) =>
  name.replace(/\(\s*AI\s*\)/gi, 'AI').replace(/\s+/g, ' ').trim();

const run = async () => {
  const snap = await db.collection('astrologers').where('isAI', '==', true).get();
  if (snap.empty) { console.log('No AI astrologers (isAI == true) found.'); return; }

  console.log(`\n${YES ? 'Applying' : 'Dry run for'} — checked ${snap.size} AI astrologer(s):\n`);
  let updated = 0, skipped = 0;
  for (const doc of snap.docs) {
    const current = String(doc.data().name ?? '').trim();
    const next = debracket(current);
    if (next === current) { skipped++; continue; }
    console.log(`${current}  ->  ${next}`);
    if (YES) await doc.ref.update({ name: next, updatedAt: FieldValue.serverTimestamp() });
    updated++;
  }

  console.log(`\n${YES ? 'Updated' : 'Would update'} ${updated}; skipped ${skipped} (already no brackets).`);
  if (!YES && updated > 0) console.log('Re-run with --yes to apply.');
};

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
