/**
 * Dumps ProKerala's raw kundli-matching response with sample births, so we can
 * verify/fix the app's Match parser against the REAL shape. Read-only; makes one
 * ProKerala call (a few credits). Needs the ProKerala creds in the environment:
 *
 *   cd ~/Projects/Asktro/firebase
 *   PROKERALA_CLIENT_ID="$(firebase functions:secrets:access PROKERALA_CLIENT_ID)" \
 *   PROKERALA_CLIENT_SECRET="$(firebase functions:secrets:access PROKERALA_CLIENT_SECRET)" \
 *   node functions/scripts/dump_match.mjs
 */
const CID = (process.env.PROKERALA_CLIENT_ID || '').trim();
const CSEC = (process.env.PROKERALA_CLIENT_SECRET || '').trim();
if (!CID || !CSEC) {
  console.error('\nMissing PROKERALA_CLIENT_ID / PROKERALA_CLIENT_SECRET in the environment.\nSee the header of this file for the exact command.\n');
  process.exit(1);
}

const TOKEN_URL = 'https://api.prokerala.com/token';
const API_BASE = 'https://api.prokerala.com/';

async function token() {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CID, client_secret: CSEC }),
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).access_token;
}

async function run() {
  const t = await token();
  const params = new URLSearchParams({
    girl_dob: '1996-08-14T06:15:00+05:30',
    girl_coordinates: '19.0760,72.8777', // Mumbai
    boy_dob: '1993-02-03T21:40:00+05:30',
    boy_coordinates: '28.6139,77.2090', // Delhi
    ayanamsa: '1',
    la: 'en',
  });
  const url = `${API_BASE}v2/astrology/kundli-matching?${params}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' } });
  const json = await res.json().catch(() => null);
  console.log(`\nHTTP ${res.status}\n`);
  console.log(JSON.stringify(json?.data ?? json, null, 2));
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
