// One-time privacy backfill for the phone-hiding / safe-card change.
//
//   cd firebase/functions
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json node scripts/backfill_privacy.mjs
//
// It does two things, idempotently (safe to re-run):
//   1. Creates a SAFE mirror card in /customerProfiles for every existing user
//      (name + birth details only — NO phone/email/money) so astrologers can
//      render existing customers after they lose read access to /users.
//   2. Moves every existing astrologer's email/phone into
//      /astrologers/{id}/private/contact and DELETES them from the public doc,
//      so a customer can never read an astrologer's phone or email.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const SAFE = [
  'name', 'profilePhoto', 'gender', 'birthDateMs', 'birthTime',
  'birthTimeKnown', 'birthPlace', 'languages', 'relationshipStatus',
];

async function backfillCustomerCards() {
  let count = 0;
  let cursor = null;
  for (;;) {
    let q = db.collection('users').orderBy('__name__').limit(400);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const d of snap.docs) {
      const u = d.data();
      const card = { updatedAt: FieldValue.serverTimestamp() };
      for (const k of SAFE) if (u[k] !== undefined) card[k] = u[k];
      batch.set(db.collection('customerProfiles').doc(d.id), card, { merge: true });
      count++;
    }
    await batch.commit();
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < 400) break;
  }
  console.log(`✓ customerProfiles backfilled: ${count}`);
}

async function moveAstrologerContact() {
  let moved = 0;
  const snap = await db.collection('astrologers').get();
  for (const d of snap.docs) {
    const a = d.data();
    if (a.email === undefined && a.phone === undefined) continue;
    await d.ref
      .collection('private')
      .doc('contact')
      .set({ email: a.email ?? null, phone: a.phone ?? null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await d.ref.update({ email: FieldValue.delete(), phone: FieldValue.delete() });
    moved++;
  }
  console.log(`✓ astrologer contact moved to private/contact (and removed from public doc): ${moved}`);
}

// 4. Move every astrologer's MONEY fields (earnings, pendingPayout,
//    commissionPercent) into /astrologers/{id}/private/financials and DELETE
//    them from the public doc, so a customer/competitor can never read another
//    astrologer's revenue or commission. Idempotent: after the first run the
//    public doc no longer carries these, so a re-run skips (has === false).
async function moveAstrologerFinancials() {
  let moved = 0;
  const snap = await db.collection('astrologers').get();
  for (const d of snap.docs) {
    // Transaction-safe move: INCREMENT the public value into financials (so a
    // consultation that settled into financials during the migration window is
    // preserved, not overwritten) and delete it from the public doc atomically.
    await db.runTransaction(async (tx) => {
      const cur = await tx.get(d.ref);
      const a = cur.data() || {};
      const has = a.earnings !== undefined || a.pendingPayout !== undefined || a.commissionPercent !== undefined;
      if (!has) return;
      const finRef = d.ref.collection('private').doc('financials');
      tx.set(
        finRef,
        {
          earnings: FieldValue.increment(a.earnings ?? 0),
          pendingPayout: FieldValue.increment(a.pendingPayout ?? 0),
          ...(a.commissionPercent !== undefined ? { commissionPercent: a.commissionPercent } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.update(d.ref, {
        earnings: FieldValue.delete(),
        pendingPayout: FieldValue.delete(),
        commissionPercent: FieldValue.delete(),
      });
      moved++;
    });
  }
  console.log(`✓ astrologer financials moved to private/financials (and removed from public doc): ${moved}`);
}

// 3. Rebuild astrologer↔customer membership markers from every existing
//    consultation, so an astrologer can still read the safe cards of customers
//    they consulted BEFORE this change (the read is now scoped to memberships).
async function backfillMemberships() {
  let count = 0;
  let cursor = null;
  for (;;) {
    let q = db.collection('consultations').orderBy('__name__').limit(400);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const d of snap.docs) {
      const c = d.data();
      if (!c.astrologerId || !c.customerId) continue;
      batch.set(
        db.collection('astrologerCustomers').doc(c.astrologerId).collection('customers').doc(c.customerId),
        { firstConsultedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      count++;
    }
    await batch.commit();
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < 400) break;
  }
  console.log(`✓ astrologer↔customer membership markers backfilled: ${count}`);
}

await backfillCustomerCards();
await moveAstrologerContact();
await moveAstrologerFinancials();
await backfillMemberships();
console.log('Privacy backfill complete.');
process.exit(0);
