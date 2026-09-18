/**
 * READ-ONLY listing of the customers who SIGNED UP on specific India days, with
 * their real details, so the numbers can be eyeballed account-by-account.
 * Writes NOTHING.
 *
 *   node scripts/list_signups_by_day.mjs                       # 2026-09-17 + 2026-09-18
 *   node scripts/list_signups_by_day.mjs --days=2026-09-18
 *
 * India-day windows (IST midnight to IST midnight) match the portal exactly.
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
const ms = (t) => t?.toMillis?.() ?? 0;
const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const DAYS = arg('days', '2026-09-17,2026-09-18').split(',').map((s) => s.trim()).filter(Boolean);
const money = (p) => `Rs.${((p || 0) / 100).toLocaleString('en-IN')}`;
// UTC-ms window for an India calendar date 'YYYY-MM-DD'.
const windowFor = (iso) => { const start = Date.parse(iso + 'T00:00:00Z') - IST; return [start, start + DAY]; };
const istTime = (m) => new Date(m + IST).toISOString().slice(11, 16); // HH:MM IST
const isComplete = (u) => {
  const name = String(u.name ?? '').trim().toLowerCase();
  return name.length > 0 && name !== 'guest' && u.birthDateMs != null && u.birthLat != null && u.birthLng != null;
};

const run = async () => {
  const snap = await db.collection('users').get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  for (const iso of DAYS) {
    const [s, e] = windowFor(iso);
    const day = rows.filter((u) => { const c = ms(u.createdAt); return c >= s && c < e; })
      .sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
    const paid = day.filter((u) => (u.totalRecharge ?? 0) > 0).length;
    const test = day.filter((u) => u.isTestAccount === true).length;
    const del = day.filter((u) => u.accountStatus === 'deleted').length;
    const incmp = day.filter((u) => !isComplete(u)).length;

    console.log(`\n================= ${iso} (India day) — ${day.length} sign-ups =================`);
    console.log(`paid ${paid} · incomplete ${incmp} · test ${test} · deleted ${del}\n`);
    console.log('  #  Time   Name                     Phone            Flags');
    day.forEach((u, i) => {
      const flags = [
        (u.totalRecharge ?? 0) > 0 ? `PAID ${money(u.totalRecharge)}` : '',
        !isComplete(u) ? 'incomplete' : '',
        u.isTestAccount === true ? 'TEST' : '',
        u.accountStatus === 'deleted' ? 'deleted' : '',
        u.accountStatus === 'blocked' ? 'blocked' : '',
      ].filter(Boolean).join(' · ');
      const name = String(u.name ?? 'Unnamed').slice(0, 22).padEnd(22);
      const phone = String(u.phone ?? u.id.slice(0, 12)).padEnd(15);
      console.log(`  ${String(i + 1).padStart(2)} ${istTime(ms(u.createdAt))}  ${name} ${phone}  ${flags}`);
    });
  }
  console.log('');
  process.exit(0);
};
run().catch((e) => { console.error(e); process.exit(1); });
