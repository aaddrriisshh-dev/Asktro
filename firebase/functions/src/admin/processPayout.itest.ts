/**
 * Integration tests for applyPayoutDecision against the Firestore emulator.
 * Proves the two money guards: a payout can never be paid twice, and never for
 * more than the astrologer's current pendingPayout.
 */
import { db, FieldValue } from '../common/admin';
import { applyPayoutDecision } from './actions';

async function seed(payoutId: string, astro: string, amount: number, pending: number) {
  await db.collection('astrologers').doc(astro).collection('private').doc('financials')
    .set({ pendingPayout: pending });
  await db.collection('payouts').doc(payoutId).set({
    astrologerId: astro, amount, status: 'pending', createdAt: FieldValue.serverTimestamp(),
  });
}

async function pendingOf(astro: string): Promise<number> {
  const s = await db.collection('astrologers').doc(astro).collection('private').doc('financials').get();
  return (s.data()?.pendingPayout ?? 0) as number;
}

describe('applyPayoutDecision (emulator)', () => {
  it('processes a payout once and refuses to process it again', async () => {
    const astro = 'ap_1';
    await seed('pay1', astro, 1000, 1000);

    await db.runTransaction((tx) => applyPayoutDecision(tx, 'pay1', 'processed', 'admin1'));
    expect(await pendingOf(astro)).toBe(0);
    const ledger = await db.collection('astrologerLedger').where('astrologerId', '==', astro).get();
    expect(ledger.docs.reduce((s, d) => s + (d.data().amount ?? 0), 0)).toBe(-1000);

    // Second attempt on an already-processed payout must fail — no double pay.
    await expect(db.runTransaction((tx) => applyPayoutDecision(tx, 'pay1', 'processed', 'admin1')))
      .rejects.toThrow(/cannot processed a processed payout/i);
    expect(await pendingOf(astro)).toBe(0); // unchanged
  });

  it('rejects a payout larger than the astrologer pendingPayout', async () => {
    const astro = 'ap_2';
    await seed('pay2', astro, 1000, 500); // asking 1000 but only 500 accrued

    await expect(db.runTransaction((tx) => applyPayoutDecision(tx, 'pay2', 'processed', 'admin1')))
      .rejects.toThrow(/PAYOUT_EXCEEDS_PENDING/);
    expect(await pendingOf(astro)).toBe(500); // untouched

    const p = (await db.collection('payouts').doc('pay2').get()).data()!;
    expect(p.status).toBe('pending'); // not marked processed
  });
});
