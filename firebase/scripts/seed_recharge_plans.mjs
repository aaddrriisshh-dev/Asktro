// Seeds the recharge plans (Add Cash tiles). Plain amounts, NO bonus for now.
// Amounts are in PAISE.
//
//   node firebase/scripts/seed_recharge_plans.mjs
//
// Idempotent: fixed document ids, so re-running overwrites. Also removes older
// bonus-tier docs that are no longer part of the set.

const PROJECT_ID = process.env.ASKTRO_PROJECT_ID || 'asktro-tech-provate-limited';
const API_KEY = process.env.ASKTRO_API_KEY || 'AIzaSyDTgJRhfYDXivkNOzPkSBi6ysW9osb4f0A';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const RUPEES = [50, 100, 200, 300, 400, 500, 1000, 2000, 3000, 4000, 5000];
const REMOVE = []; // none — all tiers are part of the set

function val(v) {
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  return { stringValue: String(v) };
}
function fields(o) {
  const f = {};
  for (const [k, v] of Object.entries(o)) f[k] = val(v);
  return f;
}

async function put(id, data) {
  const res = await fetch(`${BASE}/rechargePlans/${id}?key=${API_KEY}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fields(data) }),
  });
  if (!res.ok) throw new Error(`PATCH ${id} -> ${res.status}: ${await res.text()}`);
}
async function del(id) {
  await fetch(`${BASE}/rechargePlans/${id}?key=${API_KEY}`, { method: 'DELETE' });
}

async function main() {
  for (const id of REMOVE) {
    await del(id);
    console.log(`  ✗ removed ${id}`);
  }
  let order = 1;
  for (const rupees of RUPEES) {
    const amount = rupees * 100; // paise
    await put(`rp_${rupees}`, {
      amount,
      walletCredit: amount,
      bonus: 0,
      popular: false,
      recommended: false,
      displayOrder: order,
      active: true,
    });
    console.log(`  ✓ ₹${rupees}`);
    order++;
  }
  console.log(`\nSeeded ${RUPEES.length} recharge plans into "${PROJECT_ID}".`);
}

main().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
