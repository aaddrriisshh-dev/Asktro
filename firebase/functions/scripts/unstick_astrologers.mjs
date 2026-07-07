/**
 * One-off maintenance: free any human astrologer stuck as busy.
 *
 * Mirrors the sweep's reconciler: `available == false` should mean "on or
 * awaiting a voice/video call". Any human astrologer marked busy with NO open
 * call session is a stuck flag (crash / out-of-band delete / legacy data from
 * when chats also reserved) — set them back to available.
 *
 *   node scripts/unstick_astrologers.mjs            # dry run (shows what it would free)
 *   node scripts/unstick_astrologers.mjs --yes      # actually free them
 *
 * Run from firebase/functions (needs serviceAccountKey.json).
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
const OPEN = ['waiting', 'active', 'paused'];
const isCall = (t) => t === 'voice' || t === 'video';

async function run() {
  const busy = await db.collection('astrologers').where('available', '==', false).limit(500).get();
  const toFree = [];

  for (const astro of busy.docs) {
    if (astro.data().isAI === true) continue;
    const open = await db
      .collection('consultations')
      .where('astrologerId', '==', astro.id)
      .where('status', 'in', OPEN)
      .limit(20)
      .get();
    const onCall = open.docs.some((d) => isCall(d.data().type));
    if (onCall) continue; // genuinely on a call — leave reserved
    toFree.push({ id: astro.id, name: astro.data().name ?? '—' });
  }

  console.log(`\nAstrologers marked busy: ${busy.size}`);
  console.log(`Stuck (no open call) → will be freed: ${toFree.length}`);
  for (const a of toFree) console.log(`  • ${a.name}  (${a.id})`);

  if (!YES) {
    console.log(`\nDry run. Re-run with --yes to actually free them.\n`);
    process.exit(0);
  }

  for (let i = 0; i < toFree.length; i += 400) {
    const batch = db.batch();
    for (const a of toFree.slice(i, i + 400)) {
      batch.set(
        db.collection('astrologers').doc(a.id),
        { available: true, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    await batch.commit();
  }

  console.log(`\n✓ Freed ${toFree.length} astrologer(s). They can receive consultations again.\n`);
  process.exit(0);
}

run().catch((e) => {
  console.error(e.stack || String(e));
  process.exit(1);
});
