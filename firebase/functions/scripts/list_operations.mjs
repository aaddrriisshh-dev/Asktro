/**
 * Diagnose / clear stuck Cloud Functions (v2) deploy operations.
 *
 * Symptom this addresses: `firebase deploy` fails every function update with
 *   HTTP 409 "unable to queue the operation"
 * which means a long-running operation (LRO) is stuck in-progress and blocks
 * all new updates. This lists the in-progress operations so we can see what's
 * jammed, and (with --cancel) attempts to cancel them.
 *
 *   node scripts/list_operations.mjs            # list in-progress operations
 *   node scripts/list_operations.mjs --all      # list ALL operations (incl. done)
 *   node scripts/list_operations.mjs --cancel    # try to cancel in-progress ones
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
const SHOW_ALL = process.argv.includes('--all');
const DO_CANCEL = process.argv.includes('--cancel');

const app = initializeApp({ credential: cert(svc) });
const project = svc.project_id;

async function token() {
  const t = await app.options.credential.getAccessToken();
  return t.access_token;
}

async function api(url, method = 'GET') {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

const base = `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/${LOCATION}`;

console.log(`\nProject: ${project}   Location: ${LOCATION}\n`);

let ops = [];
let pageToken = '';
do {
  const url = `${base}/operations?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
  const { status, data } = await api(url);
  if (status !== 200) {
    console.error('List operations failed:', status, JSON.stringify(data));
    process.exit(1);
  }
  ops = ops.concat(data.operations || []);
  pageToken = data.nextPageToken || '';
} while (pageToken);

const active = ops.filter((o) => !o.done);
console.log(`Total operations returned: ${ops.length}`);
console.log(`In-progress (NOT done): ${active.length}\n`);

const toShow = SHOW_ALL ? ops : active;
for (const o of toShow) {
  const m = o.metadata || {};
  const target = m.target || m.requestResource || '';
  console.log('---');
  console.log('name      :', o.name);
  console.log('done      :', !!o.done);
  console.log('target    :', target);
  console.log('createTime:', m.createTime || '');
  console.log('endTime   :', m.endTime || '');
  console.log('verb/type :', m.verb || m.type || '');
  if (o.error) console.log('error     :', JSON.stringify(o.error));
}

if (DO_CANCEL) {
  if (!active.length) {
    console.log('\nNothing in-progress to cancel.');
  } else {
    console.log(`\nAttempting to cancel ${active.length} in-progress operation(s)...\n`);
    for (const o of active) {
      const { status, data } = await api(`https://cloudfunctions.googleapis.com/v2/${o.name}:cancel`, 'POST');
      console.log(`cancel ${o.name} -> HTTP ${status} ${status === 200 ? 'OK' : JSON.stringify(data)}`);
    }
  }
}

console.log('\nDone.\n');
process.exit(0);
