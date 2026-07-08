/**
 * Show the live state + last-update time of specific Cloud Functions (v2),
 * so we can tell whether a fix actually landed even when `firebase deploy`
 * reported "unable to queue the operation".
 *
 *   node scripts/check_functions.mjs                     # checks the default set
 *   node scripts/check_functions.mjs endConsultation ... # checks the names you pass
 *
 * Run from firebase/functions (needs serviceAccountKey.json or
 * GOOGLE_APPLICATION_CREDENTIALS pointing at the key).
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { readFileSync } from 'node:fs';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'serviceAccountKey.json';
let svc;
try {
  svc = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch {
  console.error(`\nCould not read ${keyPath}. Run from firebase/functions with a service-account key.\n`);
  process.exit(1);
}

const LOCATION = 'asia-south1';
const DEFAULT = [
  'endConsultation', 'createConsultation', 'tickConsultation',
  'sweepStaleSessions', 'processPayout',
];
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const targets = names.length ? names : DEFAULT;

const app = initializeApp({ credential: cert(svc) });
const project = svc.project_id;

async function token() {
  return (await app.options.credential.getAccessToken()).access_token;
}
async function get(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await token()}` } });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

const base = `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/${LOCATION}/functions`;
console.log(`\nProject: ${project}   Location: ${LOCATION}\n`);

for (const name of targets) {
  const { status, data } = await get(`${base}/${name}`);
  if (status !== 200) {
    console.log(`${name.padEnd(22)}   NOT FOUND / error (HTTP ${status})`);
    continue;
  }
  const state = data.state || '?';
  const updated = data.updateTime || '?';
  const rev = data.serviceConfig?.revision || '';
  console.log(`${name.padEnd(22)}  state=${state.padEnd(8)}  updated=${updated}  rev=${rev}`);
}
console.log('\nDone.\n');
process.exit(0);
