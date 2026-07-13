/**
 * Emulator tests for the paid Kundali Match charge (applyMatchCharge). Proves
 * the money core: debits exactly ₹49 (bonus first), writes the ledger, caches
 * the report, is idempotent (never double-charges the same match), and refuses
 * on insufficient balance without touching the wallet.
 */
import { db, FieldValue } from '../common/admin';
import { applyMatchCharge, KUNDLI_MATCH_PRICE_PAISE } from './kundliMatch';

async function seedUser(uid: string, wallet: number, bonus: number) {
  await db.collection('users').doc(uid).set({
    name: 'T', walletBalance: wallet, bonusBalance: bonus, totalSpent: 0, accountStatus: 'active',
    createdAt: FieldValue.serverTimestamp(),
  });
}
const REPORT = { guna_milan: { total_points: 28, maximum_points: 36 }, message: { description: 'Good match' } };

describe('applyMatchCharge (emulator)', () => {
  it('debits ₹49 wallet-first-after-bonus, writes ledger, caches report', async () => {
    const uid = 'u_km_1';
    await seedUser(uid, 10000, 0); // ₹100 wallet, no bonus
    const r = await applyMatchCharge(uid, 'k1', REPORT);
    expect(r.charged).toBe(true);
    expect(r.newBalancePaise).toBe(10000 - KUNDLI_MATCH_PRICE_PAISE);

    const u = (await db.collection('users').doc(uid).get()).data()!;
    expect(u.walletBalance).toBe(10000 - KUNDLI_MATCH_PRICE_PAISE);
    expect(u.bonusBalance).toBe(0);
    expect(u.totalSpent).toBe(KUNDLI_MATCH_PRICE_PAISE);

    const led = await db.collection('walletTransactions').where('userId', '==', uid).where('kind', '==', 'kundli_match').get();
    expect(led.size).toBe(1);
    expect(led.docs[0].data().amount).toBe(-KUNDLI_MATCH_PRICE_PAISE);

    const cache = await db.collection('users').doc(uid).collection('astro').doc('match_k1').get();
    expect(cache.exists).toBe(true);
    expect(cache.data()!.data).toMatchObject(REPORT);
  });

  it('spends bonus before wallet', async () => {
    const uid = 'u_km_2';
    await seedUser(uid, 5000, 2000); // ₹50 wallet + ₹20 bonus
    await applyMatchCharge(uid, 'k2', REPORT);
    const u = (await db.collection('users').doc(uid).get()).data()!;
    expect(u.bonusBalance).toBe(0); // ₹20 bonus fully used
    expect(u.walletBalance).toBe(5000 - (KUNDLI_MATCH_PRICE_PAISE - 2000)); // remainder from wallet
  });

  it('is idempotent — the same match never double-charges', async () => {
    const uid = 'u_km_3';
    await seedUser(uid, 20000, 0);
    const first = await applyMatchCharge(uid, 'k3', REPORT);
    expect(first.charged).toBe(true);
    const second = await applyMatchCharge(uid, 'k3', REPORT);
    expect(second.charged).toBe(false);
    expect(second.alreadyPurchased).toBe(true);

    const u = (await db.collection('users').doc(uid).get()).data()!;
    expect(u.walletBalance).toBe(20000 - KUNDLI_MATCH_PRICE_PAISE); // charged exactly once
    const led = await db.collection('walletTransactions').where('userId', '==', uid).where('kind', '==', 'kundli_match').get();
    expect(led.size).toBe(1);
  });

  it('refuses on insufficient balance and never touches the wallet', async () => {
    const uid = 'u_km_4';
    await seedUser(uid, 1000, 0); // ₹10 — not enough for ₹49
    await expect(applyMatchCharge(uid, 'k4', REPORT)).rejects.toMatchObject({ code: 'failed-precondition', message: 'INSUFFICIENT_BALANCE' });
    const u = (await db.collection('users').doc(uid).get()).data()!;
    expect(u.walletBalance).toBe(1000); // untouched
    const cache = await db.collection('users').doc(uid).collection('astro').doc('match_k4').get();
    expect(cache.exists).toBe(false); // nothing cached
  });
});
