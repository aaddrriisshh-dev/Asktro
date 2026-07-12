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

  it('IGNORES a capture whose order is not ours — shared Razorpay account (no dead-letter/alert)', async () => {
    // The account also serves another Asktro product; its payments reach our
    // webhook with an order_id that has no doc in OUR rechargeOrders. That is a
    // definitive "not ours" and must be silently ignored, not dead-lettered.
    const r = await creditCapturedPayment({ id: 'payForeign', order_id: 'ordForeign', notes: {} });
    expect(r.credited).toBe(false);
    expect(r.deadLettered).toBe(false);

    const dl = await db.collection('failedWebhookCredits').doc('payForeign').get();
    expect(dl.exists).toBe(false); // not dead-lettered
    const alert = await db.collection('alerts').doc('credit_payForeign').get();
    expect(alert.exists).toBe(false); // no false alarm
  });

  it('dead-letters a capture with NO order_id at all (genuinely unresolvable, never lost)', async () => {
    const r = await creditCapturedPayment({ id: 'payNoOrder', notes: {} });
    expect(r.credited).toBe(false);
    expect(r.deadLettered).toBe(true);

    const dl = await db.collection('failedWebhookCredits').doc('payNoOrder').get();
    expect(dl.exists).toBe(true);
    const alert = await db.collection('alerts').doc('credit_payNoOrder').get();
    expect(alert.exists).toBe(true);
  });

  it('an amount mismatch dead-letters as manualOnly and never credits the wallet', async () => {
    const uid = 'u_wh_mm';
    await seedUser(uid); await seedPlan('planMM'); await seedOrder('ordMM', uid, 'planMM');

    // Captured amount (5000) != the order's bound amount (10000). This must be
    // refused AND flagged manualOnly so the retry job can never auto-credit the
    // full plan value later (the re-audit loophole).
    const r = await creditCapturedPayment({ id: 'payMM', order_id: 'ordMM', amount: 5000, notes: {} });
    expect(r.credited).toBe(false);
    expect(r.deadLettered).toBe(true);

    const dl = (await db.collection('failedWebhookCredits').doc('payMM').get()).data()!;
    expect(dl.manualOnly).toBe(true); // retry job skips these
    const u = (await db.collection('users').doc(uid).get()).data()!;
    expect(u.walletBalance).toBe(0); // wallet untouched
    expect(u.bonusBalance).toBe(0);
  });
});
