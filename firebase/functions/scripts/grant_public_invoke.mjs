/**
 * grant_public_invoke.mjs — grant `allUsers` the Cloud Run Invoker role on
 * EVERY 2nd-gen Cloud Function service in asia-south1.
 *
 * WHY: Firebase callable/HTTPS functions enforce auth INSIDE the function
 * (via the ID token), so the underlying Cloud Run service must "allow
 * unauthenticated invocations" — otherwise Cloud Run rejects the call with
 * UNAUTHENTICATED before the function ever runs. Clean `firebase deploy`
 * grants this automatically, but our stuttering deploys skipped it, leaving
 * several functions (createConsultation, etc.) un-invokable.
 *
 * This reads the existing IAM policy per service and ADDS the binding
 * (never replaces), so Eventarc/trigger bindings are preserved.
 *
 * Run from firebase/functions with the service-account key exported:
 *   export GOOGLE_APPLICATION_CREDENTIALS="$PWD/serviceAccountKey.json"
 *   node scripts/grant_public_invoke.mjs
 */
import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'node:fs';

const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || `${process.cwd()}/serviceAccountKey.json`;
const PROJECT = JSON.parse(readFileSync(KEY, 'utf8')).project_id;
const LOCATION = 'asia-south1';

const auth = new GoogleAuth({ keyFile: KEY, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const client = await auth.getClient();

async function api(url, method = 'GET', data) {
  const res = await client.request({ url, method, data });
  return res.data;
}

const base = `https://run.googleapis.com/v2/projects/${PROJECT}/locations/${LOCATION}/services`;

console.log(`Granting allUsers → roles/run.invoker on all Cloud Run services in ${PROJECT} (${LOCATION})…\n`);

let services = [];
let pageToken;
do {
  const url = base + (pageToken ? `?pageToken=${pageToken}` : '');
  const page = await api(url);
  services = services.concat(page.services || []);
  pageToken = page.nextPageToken;
} while (pageToken);

if (services.length === 0) {
  console.log('No Cloud Run services found — nothing to do.');
  process.exit(0);
}

let granted = 0, already = 0, failed = 0;
for (const svc of services) {
  const short = svc.name.split('/').pop();
  try {
    const policy = await api(`https://run.googleapis.com/v2/${svc.name}:getIamPolicy`);
    policy.bindings = policy.bindings || [];
    let inv = policy.bindings.find((b) => b.role === 'roles/run.invoker');
    if (inv && (inv.members || []).includes('allUsers')) {
      console.log(`•  ${short} — already public`);
      already++;
      continue;
    }
    if (!inv) { inv = { role: 'roles/run.invoker', members: [] }; policy.bindings.push(inv); }
    inv.members = inv.members || [];
    inv.members.push('allUsers');
    await api(`https://run.googleapis.com/v2/${svc.name}:setIamPolicy`, 'POST', { policy });
    console.log(`✓  ${short} — granted public-invoke`);
    granted++;
  } catch (e) {
    console.error(`✗  ${short} — FAILED: ${e.message}`);
    failed++;
  }
}

console.log(`\nDone. ${granted} granted, ${already} already public, ${failed} failed.`);
if (failed) process.exit(1);
