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
 * ZERO dependencies — uses only Node's built-in `fetch` and `crypto`, so it
 * works on any Node version (the google-auth-library/node-fetch path breaks
 * on Node 26 with "Gunzip / Premature close").
 *
 * Run from firebase/functions with the service-account key exported:
 *   export GOOGLE_APPLICATION_CREDENTIALS="$PWD/serviceAccountKey.json"
 *   node scripts/grant_public_invoke.mjs
 */
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || `${process.cwd()}/serviceAccountKey.json`;
const sa = JSON.parse(readFileSync(KEY, 'utf8'));
const PROJECT = sa.project_id;
const LOCATION = 'asia-south1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// --- fetch with retry on transient network / 5xx failures ------------------
async function fetchRetry(url, opts = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt === 6) throw e;
      const wait = 1000 * 2 ** (attempt - 1); // 1,2,4,8,16s
      console.log(`   …network hiccup (${e.message}); retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

// --- mint an OAuth access token from the service-account key ----------------
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signature = b64url(createSign('RSA-SHA256').update(unsigned).sign(sa.private_key));
  const jwt = `${unsigned}.${signature}`;

  const res = await fetchRetry(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`token endpoint returned no access_token: ${JSON.stringify(data)}`);
  return data.access_token;
}

// --- authorized Cloud Run REST call ----------------------------------------
let TOKEN;
async function api(url, method = 'GET', body) {
  const res = await fetchRetry(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

// --- main -------------------------------------------------------------------
console.log(`Authenticating as ${sa.client_email}…`);
TOKEN = await getAccessToken();
console.log(`Granting allUsers → roles/run.invoker on all Cloud Run services in ${PROJECT} (${LOCATION})…\n`);

const base = `https://run.googleapis.com/v2/projects/${PROJECT}/locations/${LOCATION}/services`;
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
