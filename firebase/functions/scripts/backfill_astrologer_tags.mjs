/**
 * One-time BACKFILL so home discovery ("What do you need guidance on?" + "Browse
 * by skill") is populated for the astrologers already in the directory. Those
 * predate the `specializations` field, so every need-tile was empty.
 *
 * For each astrologer MISSING specializations, this assigns a sensible, spread-out
 * set of 4 need-tags (deterministic by doc id, so all 8 needs get coverage across
 * the roster) and, for roughly a third, adds "Palmistry" to their expertise so the
 * Palmistry skill-tile fills too. It is IDEMPOTENT — an astrologer that already has
 * specializations is skipped, so re-running is safe and it never overwrites tags
 * you set by hand in the portal. Refine any astrologer's tags in the portal later.
 *
 *   node scripts/backfill_astrologer_tags.mjs            # dry run (prints only)
 *   node scripts/backfill_astrologer_tags.mjs --apply    # write the tags
 *
 * Run from firebase/functions with a service-account key.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'serviceAccountKey.json';
let svc;
try { svc = JSON.parse(readFileSync(keyPath, 'utf8')); }
catch { console.error(`\nCould not read ${keyPath}. Run from firebase/functions with a service-account key.\n`); process.exit(1); }
initializeApp({ credential: cert(svc) });
const db = getFirestore();

const NEEDS = ['love', 'marriage', 'career', 'money', 'health', 'education', 'spirituality', 'remedies'];
const apply = process.argv.includes('--apply');

// Stable hash of the doc id → deterministic, spread assignment.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

async function run() {
  const snap = await db.collection('astrologers').get();
  let tagged = 0, skipped = 0, palm = 0;
  let batch = db.batch();
  let n = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const has = Array.isArray(d.specializations) && d.specializations.length > 0;
    if (has) { skipped++; continue; }

    const h = hash(doc.id);
    // 4 consecutive needs from a rotating start → every category gets coverage.
    const start = h % NEEDS.length;
    const specs = [0, 1, 2, 3].map((k) => NEEDS[(start + k) % NEEDS.length]);

    const patch = { specializations: specs, updatedAt: FieldValue.serverTimestamp() };
    // ~1 in 3 also does palmistry (adds the tag to expertise if missing).
    if (h % 3 === 0) {
      const exp = Array.isArray(d.expertise) ? d.expertise : [];
      if (!exp.includes('Palmistry')) { patch.expertise = [...exp, 'Palmistry']; palm++; }
    }

    if (apply) {
      batch.set(doc.ref, patch, { merge: true });
      if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }
    tagged++;
  }
  if (apply && n % 400 !== 0) await batch.commit();

  console.log(`${apply ? 'Tagged' : 'Would tag'} ${tagged} astrologers (${palm} also given Palmistry); ${skipped} already had tags.`);
  if (!apply) console.log('Dry run — re-run with --apply to write.');
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
