/**
 * Bulk-rename AI astrologers (isAI == true) to their new display names.
 *
 *   node scripts/rename_ai_astrologers.mjs         # dry run — prints old -> new
 *   node scripts/rename_ai_astrologers.mjs --yes   # apply the changes
 *
 * Run from firebase/functions (needs serviceAccountKey.json or
 * GOOGLE_APPLICATION_CREDENTIALS pointing at the key).
 *
 * Names are read LIVE by the app and portal (astrologers/{id}.name), so this
 * takes effect instantly — no app rebuild, no function redeploy. Safe to re-run
 * (a doc whose name already matches its target is skipped).
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

// id  ->  new display name
const RENAMES = {
  'persona_aditya-trivedi': 'Acharya Ai Aditya Trivedi',
  'persona_omprakash-lk': 'Om Prakash Ai',
  'persona_ramkishore': 'Acharya Ai Ram Kishore',
  'persona_venkatesh-kp': 'Acharya Ai Venkatesh Rao',
  'persona_vidyanath': 'Pandit Ai Vidyanath Shastri',
  'persona_shakuntala-lk': 'Guru Maa Ai Shakuntala',
  'persona_sunita-devi': 'Guru Maa Ai Sunita Devi',
  'persona_krishnamurthy-s': 'Guru Ai S. Krishnamurthy',
  'persona_anjali-nair': 'Jyotishi Ai Anjali Nair',
  'persona_devika-sen': 'Jyotishi Ai Devika Sen',
  'persona_ganesh-kp': 'Jyotishi Ai Ganesh Subramanian',
  'persona_kavya-reddy': 'Jyotishi Ai Kavya Reddy',
  'persona_lakshmi-iyer': 'Jyotishi Ai Lakshmi Iyer',
  'persona_meera-joshi': 'Jyotishi Ai Meera Joshi',
  'persona_nithya-kp': 'Jyotishi Ai Nithya Balan',
  'persona_priya-kp': 'Jyotishi Ai Riya Menon',
  'persona_reena-lk': 'Jyotishi Ai Reena Kapoor',
  'persona_naresh-numero': 'Numerologist Ai Naresh Advani',
  'persona_sudha-numero': 'Numerologist Ai Sudha Menon',
  'persona_balbir-lalkitab': 'Pandit Ai Balbir Singh',
  'persona_darshan-lk': 'Pandit Ai Darshan Lal',
  'persona_gopal-mishra': 'Pandit Ai Gopal Mishra',
  'persona_harish-chandra': 'Pandit Ai Harish Chandra',
  'persona_raghavendra': 'Pandit Ai Raghavendra Rao',
  'persona_aryan-tarot': 'Tarot Reader Ai Aryan Kapoor',
  'persona_tanya-tarot': 'Tarot Ai Tanya Sharma',
};

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

const run = async () => {
  const ids = Object.keys(RENAMES);
  console.log(`\n${YES ? 'Applying' : 'Dry run for'} ${ids.length} rename(s):\n`);

  let updated = 0, skipped = 0, missing = 0;
  for (const id of ids) {
    const target = RENAMES[id].trim();
    const ref = db.collection('astrologers').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`MISSING (no such doc): ${id}`);
      missing++;
      continue;
    }
    const current = String(snap.data().name ?? '').trim();
    if (current === target) {
      console.log(`skip (already set): ${target}`);
      skipped++;
      continue;
    }
    console.log(`${current}  ->  ${target}`);
    if (YES) {
      await ref.update({ name: target, updatedAt: FieldValue.serverTimestamp() });
    }
    updated++;
  }

  console.log(`\n${YES ? 'Updated' : 'Would update'} ${updated}; skipped ${skipped}; missing ${missing}.`);
  if (!YES && updated > 0) console.log('Re-run with --yes to apply.');
};

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
