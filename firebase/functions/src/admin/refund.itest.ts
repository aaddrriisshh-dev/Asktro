/**
 * Integration tests for applyRefund against the Firestore emulator.
 * Covers the two accounting bugs the external brief flagged:
 *  - P3-7: a refund of a bonus-funded session must NOT create withdrawable cash.
 *  - P3-8: a refund after the astrologer's payout cleared must keep the
 *    astrologerLedger reconciled with pendingPayout.
 * Plus per-amount idempotency.
 */
import { db, FieldValue } from '../common/admin';
import { applyRefund } from './refund';
import { GlobalConfig } from '../common/types';

const CONFIG: GlobalConfig = {
  consultationPricePerMinutePaise: 900, minWalletToStartPaise: 1800,
  warnLevel1Sec: 60, warnLevel2Sec: 20, reconnectTimeoutSec: 45,
  sessionTimeoutSec: 300, requestTimeoutSec: 90, commissionPercent: 20,
  freeChatMinutes: 3, graceMinutes: 0,
  featureFlags: { voice: true, video: true, referrals: true },
};

async function ledgerSum(astroId: string): Promise<number> {
  const q = await db.collection('astrologerLedger').where('astrologerId', '==', astroId).get();
  return q.docs.reduce((s, d) => s + (d.data().amount ?? 0), 0);
}

describe('applyRefund (emulator)', () => {
  it('P3-7: a bonus-funded session refunds to bonus, never to withdrawable wallet', async () => {
    const cid = 'r_1', cust = 'uc_1', astro = 'aa_1';
    await db.collection('users').doc(cust).set({ walletBalance: 0, bonusBalance: 0 });
    await db.collection('astrologers').doc(astro).collection('private').doc('financials')
      .set({ earnings: 720, pendingPayout: 720 });
    await db.collection('consultations').doc(cid).set({
      customerId: cust, astrologerId: astro, type: 'chat', status: 'completed',
      totalCharged: 900, chargedFromWallet: 0, chargedFromBonus: 900, commissionPercent: 20,
      createdAt: FieldValue.serverTimestamp(),
    });

    const out = await db.runTransaction((tx) => applyRefund(tx, cid, { actorUid: 'admin1' }, CONFIG));
    expect(out.walletRefund).toBe(0);
    expect(out.bonusRefund).toBe(900);

    const u = (await db.collection('users').doc(cust).get()).data()!;
    expect(u.walletBalance).toBe(0);   // NOT turned into cash
    expect(u.bonusBalance).toBe(900);  // returned to the non-withdrawable bucket

    const fin = (await db.collection('astrologers').doc(astro).collection('private').doc('financials').get()).data()!;
    expect(fin.pendingPayout).toBe(0); // 720 net clawed back
  });

  it('P3-8: a refund after the payout cleared keeps the ledger reconciled with pendingPayout', async () => {
    const cid = 'r_2', cust = 'uc_2', astro = 'aa_2';
    await db.collection('users').doc(cust).set({ walletBalance: 0, bonusBalance: 0 });
    // Astrologer earned 800 then was fully paid out → pendingPayout 0. Ledger
    // reconciles: +800 earning, -800 payout, sum 0 == pendingPayout 0.
    await db.collection('astrologers').doc(astro).collection('private').doc('financials')
      .set({ earnings: 800, pendingPayout: 0 });
    await db.collection('astrologerLedger').doc('r2_earn').set({ astrologerId: astro, kind: 'earning', amount: 800 });
    await db.collection('astrologerLedger').doc('r2_pay').set({ astrologerId: astro, kind: 'payout', amount: -800 });
    await db.collection('consultations').doc(cid).set({
      customerId: cust, astrologerId: astro, type: 'chat', status: 'completed',
      totalCharged: 1000, chargedFromWallet: 1000, commissionPercent: 20,
      createdAt: FieldValue.serverTimestamp(),
    });

    expect(await ledgerSum(astro)).toBe(0); // reconciled before the refund

    const out = await db.runTransaction((tx) => applyRefund(tx, cid, { actorUid: 'admin1' }, CONFIG));
    expect(out.shortfall).toBe(800); // net was already paid out — nothing to reclaim from pending

    const fin = (await db.collection('astrologers').doc(astro).collection('private').doc('financials').get()).data()!;
    expect(await ledgerSum(astro)).toBe(fin.pendingPayout); // STILL reconciled (both 0), not -800

    const alerts = await db.collection('alerts').where('kind', '==', 'refund_clawback_shortfall').get();
    expect(alerts.size).toBe(1); // operator flagged to net it off a future payout
  });

  it('is idempotent per amount: a fully-refunded session cannot be refunded again', async () => {
    const cid = 'r_3', cust = 'uc_3', astro = 'aa_3';
    await db.collection('users').doc(cust).set({ walletBalance: 0, bonusBalance: 0 });
    await db.collection('astrologers').doc(astro).collection('private').doc('financials')
      .set({ earnings: 720, pendingPayout: 720 });
    await db.collection('consultations').doc(cid).set({
      customerId: cust, astrologerId: astro, type: 'chat', status: 'completed',
      totalCharged: 900, chargedFromWallet: 900, commissionPercent: 20,
      createdAt: FieldValue.serverTimestamp(),
    });

    await db.runTransaction((tx) => applyRefund(tx, cid, { actorUid: 'admin1' }, CONFIG));
    const u = (await db.collection('users').doc(cust).get()).data()!;
    expect(u.walletBalance).toBe(900);

    await expect(db.runTransaction((tx) => applyRefund(tx, cid, { actorUid: 'admin1' }, CONFIG)))
      .rejects.toThrow(/nothing left to refund/i);
    const u2 = (await db.collection('users').doc(cust).get()).data()!;
    expect(u2.walletBalance).toBe(900); // not double-refunded
  });
});
