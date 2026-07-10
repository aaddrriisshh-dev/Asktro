/**
 * Integration tests for the razorpayWebhook credit path (P1-1) against the
 * Firestore emulator, via the extracted creditCapturedPayment(). Proves the bug
 * the external brief flagged: a captured payment with EMPTY payment-entity notes
 * (Razorpay's real behaviour) must still credit, resolved from the authoritative
 * rechargeOrders doc — and that money is never silently lost.
 */
import { db, FieldValue } from '../common/admin';
import { creditCapturedPayment } from './recharge';

async function seedUser(uid: string) {
  await db.collection('users').doc(uid).set({
    name: 'T', walletBalance: 0, bonusBalance: 0, totalRecharge: 0, accountStatus: 'active',
    createdAt: FieldValue.serverTimestamp(),
  });
}
async function seedPlan(planId: string) {
  await db.collection('rechargePlans').doc(planId).set({ active: true, amount: 10000, walletCredit: 10000, bonus: 2000 });
}
async function seedOrder(orderId: string, userId: string, planId: string) {
  await db.collection('rechargeOrders').doc(orderId).set({ userId, planId, amountPaise: 10000 });
}

describe('creditCapturedPayment (webhook, emulator)', () => {
  it('credits from the order doc even when the payment-entity notes are EMPTY', async () => {
    const uid = 'u_wh_1';
    await seedUser(uid); await seedPlan('planW'); await seedOrder('ordW1', uid, 'planW');

    // Razorpay's payment.captured carries no order notes — the OLD code read
    // entity.notes and credited nothing. This must now credit via the order doc.
    const r = await creditCapturedPayment({ id: 'payW1', order_id: 'ordW1', notes: {} });
    expect(r.credited).toBe(true);

    const u = (await db.collection('users').doc(uid).get()).data()!;
    expect(u.walletBalance).toBe(10000);
    expect(u.bonusBalance).toBe(2000);
  });

  it('is idempotent — the same captured payment credits exactly once', async () => {
    const uid = 'u_wh_2';
    await seedUser(uid); await seedPlan('planW2'); await seedOrder('ordW2', uid, 'planW2');

    await creditCapturedPayment({ id: 'payW2', order_id: 'ordW2', notes: {} });
    await creditCapturedPayment({ id: 'payW2', order_id: 'ordW2', notes: {} }); // duplicate delivery
    const u = (await db.collection('users').doc(uid).get()).data()!;
    expect(u.walletBalance).toBe(10000); // not 20000
  });

  it('dead-letters a captured payment with no matching order (never silently lost)', async () => {
    const r = await creditCapturedPayment({ id: 'payX', order_id: 'ordMissing', notes: {} });
    expect(r.credited).toBe(false);
    expect(r.deadLettered).toBe(true);

    const dl = await db.collection('failedWebhookCredits').doc('payX').get();
    expect(dl.exists).toBe(true);
    const alert = await db.collection('alerts').doc('credit_payX').get();
    expect(alert.exists).toBe(true);
  });
});
