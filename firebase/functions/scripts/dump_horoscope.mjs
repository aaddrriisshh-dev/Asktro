/**
 * Dumps the raw ProKerala daily-horoscope response we cached, so we can see the
 * exact JSON shape and fix the app's parser. Read-only.
 *
 *   cd firebase/functions
 *   GOOGLE_APPLICATION_CREDENTIALS=<key.json> node scripts/dump_horoscope.mjs
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'serviceAccountKey.json';
let svc;
try { svc = JSON.parse(readFileSync(keyPath, 'utf8')); }
catch { console.error(`\nCould not read ${keyPath}.\n`); process.exit(1); }
initializeApp({ credential: cert(svc) });
const db = getFirestore();

async function run() {
  const users = await db.collection('users').get();
  let found = 0;
  for (const u of users.docs) {
    const astro = await u.ref.collection('astro').get();
    for (const d of astro.docs) {
      if (!d.id.startsWith('horoscope_')) continue;
      found++;
      console.log(`\n===== users/${u.id}/astro/${d.id} =====`);
      console.log(JSON.stringify(d.data().data ?? d.data(), null, 2));
    }
  }
  if (!found) console.log('\nNo cached horoscope_* docs found (open Daily Horoscope in the app first).');
  console.log('\nDone (read-only).');
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
