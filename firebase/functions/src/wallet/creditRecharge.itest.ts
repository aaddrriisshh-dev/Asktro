/**
 * Integration tests for creditRecharge against the Firestore emulator.
 * Run via: npm run test:integration (wraps this in `firebase emulators:exec`).
 *
 * Covers the money-MOVING guarantees that pure unit tests cannot: a captured
 * payment credits exactly once even when the callable and the webhook both fire,
 * and a second payment on the same order never double-credits.
 */
import { db, FieldValue, Timestamp } from '../common/admin';
import { creditRecharge, autoResumePausedSession } from './creditRecharge';

async function seedUser(uid: string) {
  await db.collection('users').doc(uid).set({
    name: 'Test', walletBalance: 0, bonusBalance: 0, totalRecharge: 0, accountStatus: 'active',
    createdAt: FieldValue.serverTimestamp(),
  });
}
async function seedPlan(planId: string) {
  await db.collection('rechargePlans').doc(planId).set({ active: true, amount: 10000, walletCredit: 10000, bonus: 2000 });
}
async function seedOrder(orderId: string, userId: string, planId: string) {
  await db.collection('rechargeOrders').doc(orderId).set({ userId, planId, amountPaise: 10000 });
}

describe('creditRecharge (emulator)', () => {
  it('credits wallet + bonus exactly once, and is idempotent per paymentId', async () => {
    const uid = 'u_credit_1';
    await seedUser(uid); await seedPlan('plan1'); await seedOrder('ord1', uid, 'plan1');

    const r1 = await creditRecharge({ userId: uid, paymentId: 'pay1', orderId: 'ord1', planId: 'plan1', source: 'callable' });
    expect(r1.credited).toBe(true);
    expect(r1.walletCreditPaise).toBe(10000);
    expect(r1.bonusPaise).toBe(2000);

    // Same payment again (webhook racing the callable) → no second credit.
    const r2 = await creditRecharge({ userId: uid, paymentId: 'pay1', orderId: 'ord1', planId: 'plan1', source: 'webhook' });
    expect(r2.alreadyProcessed).toBe(true);
    expect(r2.credited).toBe(false);

    const u = (await db.collection('users').doc(uid).get()).data()!;
    expect(u.walletBalance).toBe(10000);
    expect(u.bonusBalance).toBe(2000);
    expect(u.totalRecharge).toBe(10000);
  });

  it('does not double-credit a second payment on the same order', async () => {
    const uid = 'u_credit_2';
    await seedUser(uid); await seedPlan('plan2'); await seedOrder('ord2', uid, 'plan2');

    const a = await creditRecharge({ userId: uid, paymentId: 'payA', orderId: 'ord2', planId: 'plan2', source: 'callable' });
    expect(a.credited).toBe(true);

    // A DIFFERENT captured payment on the SAME order must be rejected.
    const b = await creditRecharge({ userId: uid, paymentId: 'payB', orderId: 'ord2', planId: 'plan2', source: 'webhook' });
    expect(b.credited).toBe(false);
    expect(b.alreadyProcessed).toBe(true);

    const u = (await db.collection('users').doc(uid).get()).data()!;
    expect(u.walletBalance).toBe(10000); // credited once, not 20000
  });

  it('autoResumePausedSession re-seeds presence so billing does not stall after resume', async () => {
    const uid = 'u_resume_1', cid = 'c_resume_1';
    await db.collection('users').doc(uid).set({ walletBalance: 5000 });
    const stale = Timestamp.fromMillis(Date.now() - 300_000); // 5 min ago
    await db.collection('consultations').doc(cid).set({
      customerId: uid, astrologerId: 'a1', type: 'chat', status: 'paused',
      pausedAt: stale, lastTickAt: stale, customerLastTickAt: stale, astrologerLastTickAt: stale,
      createdAt: FieldValue.serverTimestamp(),
    });

    const resumed = await autoResumePausedSession(uid);
    expect(resumed).toBe(cid);

    const c = (await db.collection('consultations').doc(cid).get()).data()!;
    expect(c.status).toBe('active');
    // BOTH presence markers refreshed to ~now. The astrologer marker must be
    // re-seeded (NOT null): a null marker disables the absent-astrologer billing
    // gate and over-bills the customer after resume. Seeded-to-now keeps the gate
    // armed while not stalling billing (frontier not pinned below lastTickAt).
    expect(c.customerLastTickAt.toMillis()).toBeGreaterThan(stale.toMillis());
    expect(c.astrologerLastTickAt).not.toBeNull();
    expect(c.astrologerLastTickAt.toMillis()).toBeGreaterThan(stale.toMillis());
  });
});
