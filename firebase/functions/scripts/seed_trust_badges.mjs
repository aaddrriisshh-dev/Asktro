/**
 * Seed the home "trust" band (`homeSections/trust`) — the "Why people trust
 * Asktro" assurance strip shown on the home screen, just under the Asktro Mall
 * store rail. Fully portal-editable afterwards (Admin → Home Content).
 *
 *   node scripts/seed_trust_badges.mjs         # dry run (prints what it will write)
 *   node scripts/seed_trust_badges.mjs --yes   # actually write homeSections/trust
 *
 * Run from firebase/functions (needs serviceAccountKey.json or
 * GOOGLE_APPLICATION_CREDENTIALS pointing at the key).
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

const DOC = {
  type: 'trust',
  active: true,
  position: 25,
  title: 'Why People Trust Asktro',
  subtitle: 'Real experts, real guidance, no compromises.',
  footer: 'Authentic · Verified · Confidential',
  items: [
    {
      icon: 'genuine',
      title: '100% Genuine Products',
      subtitle: 'Lab-tested & verified',
    },
    {
      icon: 'verified',
      title: 'Asktro Verified Astrologers',
      subtitle: 'Real experts with proven experience',
    },
    {
      icon: 'secure',
      title: 'Private & Confidential',
      subtitle: '100% secure consultations',
    },
  ],
};

async function main() {
  console.log(`${YES ? 'Writing' : 'Would write'} homeSections/trust:`);
  console.log(JSON.stringify(DOC, null, 2));

  if (YES) {
    await db.collection('homeSections').doc('trust').set(
      { ...DOC, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    console.log('\n✔ Seeded homeSections/trust.\n');
  } else {
    console.log('\n(dry run — pass --yes to write)\n');
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
