/**
 * One-time cleanup: remove the OLD filler AI astrologers now that the curated
 * 26-persona roster is live, and drop the Vastu persona (Vastu was removed from
 * Asktro). It ONLY ever touches `isAI == true` docs — human astrologers are never
 * considered — and KEEPS the curated roster (`__personaRoster == true`), except
 * the Vastu persona.
 *
 * SAFE BY DEFAULT: a dry run prints exactly what it WILL remove and KEEP so you
 * can eyeball it before anything is deleted.
 *
 *   node scripts/cleanup_old_ai_astrologers.mjs            # dry run (prints only)
 *   node scripts/cleanup_old_ai_astrologers.mjs --apply    # actually delete
 *
 * Run from firebase/functions with a service-account key (same as the seed).
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'serviceAccountKey.json';
let svc;
try { svc = JSON.parse(readFileSync(keyPath, 'utf8')); }
catch { console.error(`\nCould not read ${keyPath}. Run from firebase/functions with a service-account key.\n`); process.exit(1); }
initializeApp({ credential: cert(svc) });
const db = getFirestore();

const apply = process.argv.includes('--apply');
const DROP_VASTU = 'persona_mahesh-vastu'; // Vastu removed from Asktro — drop this persona too

async function run() {
  // Only AI astrologers are ever in scope — humans are untouched.
  const snap = await db.collection('astrologers').where('isAI', '==', true).get();
  const keep = [];
  const remove = [];
  for (const d of snap.docs) {
    const data = d.data();
    const curated = data.__personaRoster === true && d.id !== DROP_VASTU;
    (curated ? keep : remove).push({ id: d.id, name: data.name || '(no name)' });
  }

  console.log(`\nAI astrologers: ${snap.size} total  →  keep ${keep.length} (curated roster), remove ${remove.length}.`);
  console.log('\n--- WILL REMOVE ---');
  remove.forEach((r) => console.log(`  ✗ ${r.name}  [${r.id}]`));
  console.log('\n--- WILL KEEP (the curated roster) ---');
  keep.forEach((r) => console.log(`  ✓ ${r.name}  [${r.id}]`));

  if (!apply) {
    console.log('\nDry run — nothing deleted. Re-run with --apply to remove the "WILL REMOVE" list.\n');
    return;
  }

  let batch = db.batch();
  let n = 0;
  for (const r of remove) {
    batch.delete(db.collection('astrologers').doc(r.id));
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (n % 400 !== 0) await batch.commit();
  console.log(`\n✓ Removed ${remove.length} old AI astrologers. Kept ${keep.length} curated personas.\n`);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
