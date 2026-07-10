/**
 * Integration tests for settleConsultation against the Firestore emulator — the
 * settlement point where a completed session credits the astrologer's net
 * earning. Covers: earnings credit + ledger trail, idempotent no double-credit
 * on a re-end, and the waiting→cancelled path (no earnings).
 */
import { db, FieldValue, Timestamp } from '../common/admin';
import { settleConsultation } from './endConsultation';
import { GlobalConfig } from '../common/types';

const CONFIG: GlobalConfig = {
  consultationPricePerMinutePaise: 900,
  minWalletToStartPaise: 1800,
  warnLevel1Sec: 60, warnLevel2Sec: 20, reconnectTimeoutSec: 45,
  sessionTimeoutSec: 300, requestTimeoutSec: 90, commissionPercent: 20,
  freeChatMinutes: 3, graceMinutes: 0,
  featureFlags: { voice: true, video: true, referrals: true },
};

async function seedActive(cid: string, custId: string, astroId: string, totalCharged: number, tMs: number) {
  const t = Timestamp.fromMillis(tMs);
  await db.collection('users').doc(custId).set({ walletBalance: 5000, bonusBalance: 0, totalConsultations: 0 });
  await db.collection('astrologers').doc(astroId).set({ name: 'A', totalConsultations: 0, available: false });
  await db.collection('astrologers').doc(astroId).collection('private').doc('financials')
    .set({ earnings: 0, pendingPayout: 0, commissionPercent: 20 });
  await db.collection('consultations').doc(cid).set({
    customerId: custId, astrologerId: astroId, type: 'chat',
    status: 'active', pricePerMinute: 900, commissionPercent: 20,
    billedSeconds: 60, totalCharged,
    // lastTickAt == settle nowMs → the final tick bills exactly 0s (deterministic).
    lastTickAt: t, customerLastTickAt: t,
    createdAt: FieldValue.serverTimestamp(),
  });
}

describe('settleConsultation (emulator)', () => {
  it('credits the astrologer net earning + writes a ledger row, and is idempotent', async () => {
    const cid = 'c_end_1', cust = 'u_end_1', astro = 'a_end_1';
    const T = Date.now();
    await seedActive(cid, cust, astro, 900, T); // gross 900, commission 20% → net 720

    const out = await db.runTransaction((tx) =>
      settleConsultation(tx, cid, CONFIG, T, { uid: astro, isAdmin: false }));
    expect(out.alreadyEnded).toBe(false);
    expect(out.totalCharged).toBe(900);
    expect(out.astrologerNet).toBe(720);

    const fin = (await db.collection('astrologers').doc(astro).collection('private').doc('financials').get()).data()!;
    expect(fin.earnings).toBe(720);
    expect(fin.pendingPayout).toBe(720);

    const c = (await db.collection('consultations').doc(cid).get()).data()!;
    expect(c.status).toBe('completed');
    expect(c.receiptNo).toBeTruthy();

    const ledger = await db.collection('astrologerLedger').where('astrologerId', '==', astro).get();
    expect(ledger.size).toBe(1);
    expect(ledger.docs[0].data().amount).toBe(720);

    // Re-end (double click / race) → idempotent no-op, NO second credit.
    const again = await db.runTransaction((tx) =>
      settleConsultation(tx, cid, CONFIG, Date.now(), { uid: astro, isAdmin: false }));
    expect(again.alreadyEnded).toBe(true);
    const fin2 = (await db.collection('astrologers').doc(astro).collection('private').doc('financials').get()).data()!;
    expect(fin2.earnings).toBe(720); // unchanged — not 1440
    const ledger2 = await db.collection('astrologerLedger').where('astrologerId', '==', astro).get();
    expect(ledger2.size).toBe(1); // still one row
  });

  it('a session ended while still waiting is cancelled with no earnings', async () => {
    const cid = 'c_end_2', cust = 'u_end_2', astro = 'a_end_2';
    await db.collection('astrologers').doc(astro).collection('private').doc('financials')
      .set({ earnings: 0, pendingPayout: 0, commissionPercent: 20 });
    await db.collection('consultations').doc(cid).set({
      customerId: cust, astrologerId: astro, type: 'voice', status: 'waiting',
      pricePerMinute: 900, commissionPercent: 20, billedSeconds: 0, totalCharged: 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    const out = await db.runTransaction((tx) =>
      settleConsultation(tx, cid, CONFIG, Date.now(), { uid: cust, isAdmin: false }));
    expect(out.cancelled).toBe(true);
    expect(out.astrologerNet).toBe(0);

    const c = (await db.collection('consultations').doc(cid).get()).data()!;
    expect(c.status).toBe('cancelled');
    const fin = (await db.collection('astrologers').doc(astro).collection('private').doc('financials').get()).data()!;
    expect(fin.earnings).toBe(0); // never credited
  });
});
