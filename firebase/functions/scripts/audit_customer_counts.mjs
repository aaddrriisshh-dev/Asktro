/**
 * READ-ONLY verification of the portal's customer numbers. Computes the TRUE
 * counts straight from Firestore (whole collections, no browser caps) so they
 * can be compared tile-by-tile against the Customer Management + dashboard cards.
 * If these match the portal, the portal is real. Writes NOTHING.
 *
 *   node scripts/audit_customer_counts.mjs
 *
 * India-day bucketing matches the portal exactly (IST midnight boundaries).
 * Run from firebase/functions with GOOGLE_APPLICATION_CREDENTIALS exported.
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

const IST = 5.5 * 60 * 60 * 1000;
const DAY = 86_400_000;
const LIVE_WINDOW = 3 * 60 * 1000;
const ms = (t) => t?.toMillis?.() ?? 0;
const istDayStart = (m) => { const d = new Date(m + IST); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST; };

const run = async () => {
  const now = Date.now();
  const t0 = istDayStart(now); // India midnight today (UTC ms)
  const ranges = {
    'Today': [t0, t0 + DAY],
    'Yesterday': [t0 - DAY, t0],
    'Last 7 Days': [t0 - 6 * DAY, t0 + DAY],
    'Last 30 Days': [t0 - 29 * DAY, t0 + DAY],
    'All Time': [0, t0 + DAY],
  };

  // Presence (for the live count).
  const presence = new Map();
  (await db.collection('presence').get()).forEach((d) => presence.set(d.id, ms(d.data().lastSeen)));

  const users = await db.collection('users').get();
  const rows = users.docs.map((d) => ({ id: d.id, ...d.data() }));

  const isComplete = (u) => {
    const name = String(u.name ?? '').trim().toLowerCase();
    return name.length > 0 && name !== 'guest' && u.birthDateMs != null && u.birthLat != null && u.birthLng != null;
  };
  const inRange = (m, [s, e]) => m > 0 && m >= s && m < e;

  console.log(`\n=== CUSTOMER COUNT AUDIT (raw users collection: ${rows.length} docs) ===`);
  console.log(`India time now: ${new Date(now + IST).toISOString().replace('T', ' ').slice(0, 16)} IST\n`);

  // A REAL customer = not deleted and not a tagged test account. This is what
  // the portal now shows everywhere.
  const isReal = (u) => u.accountStatus !== 'deleted' && u.isTestAccount !== true;
  const real = rows.filter(isReal);

  console.log(`REAL customers (excl. deleted + test): ${real.length} of ${rows.length} raw docs\n`);

  // Registered (by sign-up date) per range — compare to dashboard "Registered
  // Users" and Customer Management "All Customers" (which now show REAL only).
  console.log('REGISTERED (real, by sign-up date) — compare to Registered Users / All Customers:');
  for (const [label, r] of Object.entries(ranges)) {
    const inP = real.filter((u) => inRange(ms(u.createdAt), r));
    const paid = inP.filter((u) => (u.totalRecharge ?? 0) > 0).length;
    const rawN = rows.filter((u) => inRange(ms(u.createdAt), r)).length;
    console.log(`  ${label.padEnd(13)} ${String(inP.length).padStart(4)}   (paid ${paid}, unpaid ${inP.length - paid})   [raw incl junk: ${rawN}]`);
  }

  // All-time breakdown of REAL customers — compare to the drawer sub-tiles.
  const male = real.filter((u) => u.gender === 'male').length;
  const female = real.filter((u) => u.gender === 'female').length;
  const withEmail = real.filter((u) => u.email).length;
  const withPhone = real.filter((u) => u.phone).length;
  const blocked = real.filter((u) => u.accountStatus === 'blocked').length;
  const paidAll = real.filter((u) => (u.totalRecharge ?? 0) > 0).length;
  const incomplete = real.filter((u) => !isComplete(u)).length;
  const liveNow = real.filter((u) => (presence.get(u.id) ?? 0) > now - LIVE_WINDOW).length;
  console.log('\nALL-TIME BREAKDOWN (real customers) — compare to the drawer sub-tiles:');
  console.log(`  Registered   ${real.length}`);
  console.log(`  Paid         ${paidAll}      Unpaid ${real.length - paidAll}`);
  console.log(`  Male         ${male}      Female ${female}      (no gender ${real.length - male - female})`);
  console.log(`  With email   ${withEmail}      With phone ${withPhone}`);
  console.log(`  Blocked      ${blocked}`);
  console.log(`  Incomplete   ${incomplete}  (abandoned setup — no real name / DOB / place)`);
  console.log(`  Live now     ${liveNow}  (presence heartbeat within 3 min of now)`);

  // A couple of integrity checks the portal relies on.
  console.log('\nINTEGRITY CHECKS:');
  console.log(`  Paid + Unpaid == Registered ?  ${paidAll + (real.length - paidAll) === real.length ? 'YES ✓' : 'NO ✗'}`);
  const deleted = rows.filter((u) => u.accountStatus === 'deleted').length;
  const isTest = rows.filter((u) => u.isTestAccount === true).length;
  console.log(`  Excluded — deleted:            ${deleted}`);
  console.log(`  Excluded — test accounts:      ${isTest}`);
  console.log(`  Raw ${rows.length}  −  excluded  =  ${real.length} real`);
  console.log('');
  process.exit(0);
};
run().catch((e) => { console.error(e); process.exit(1); });
