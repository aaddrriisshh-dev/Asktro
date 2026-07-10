/**
 * Integration tests for the sweep safety-net jobs against the Firestore emulator.
 *  - billStaleActive: a disconnected active session is billed only the settle
 *    window past its last contact (never the full silent gap) and PAUSED, not
 *    closed. (The audit's "drop at 4:59 of 5:00" scenario.)
 *  - expirePaused: a paused session past the timeout is expired and the
 *    astrologer credited using the session's snapshot commission.
 */
import { db, FieldValue, Timestamp } from '../common/admin';
import { billStaleActive, expirePaused } from './sweepSessions';
import { GlobalConfig } from '../common/types';

const CONFIG: GlobalConfig = {
  consultationPricePerMinutePaise: 900, minWalletToStartPaise: 1800,
  warnLevel1Sec: 60, warnLevel2Sec: 20, reconnectTimeoutSec: 45,
  sessionTimeoutSec: 300, commissionPercent: 20, requestTimeoutSec: 90,
  freeChatMinutes: 3, graceMinutes: 0,
  featureFlags: { voice: true, video: true, referrals: true },
};

describe('sweepSessions (emulator)', () => {
  it('billStaleActive bills only the settle window on a disconnect, then PAUSES', async () => {
    const T = Date.now();
    const cid = 's_1', uid = 'us_1';
    await db.collection('users').doc(uid).set({ walletBalance: 100_000, bonusBalance: 0 });
    // Client silent for 60s (> 45s grace). A naive meter would bill 60s; the
    // sweep must bill only the ~15s settle window, then pause.
    const t = Timestamp.fromMillis(T - 60_000);
    await db.collection('consultations').doc(cid).set({
      customerId: uid, astrologerId: 'a1', type: 'chat', chatCreditEligible: true,
      status: 'active', pricePerMinute: 900, billedSeconds: 0, totalCharged: 0,
      lastTickAt: t, customerLastTickAt: t,
      createdAt: FieldValue.serverTimestamp(),
    });

    await billStaleActive(CONFIG, T);

    const c = (await db.collection('consultations').doc(cid).get()).data()!;
    expect(c.status).toBe('paused');          // paused, NOT completed/expired
    expect(c.billedSeconds).toBe(15);         // settle window only, not 60
    expect(c.totalCharged).toBe(225);
    const u = (await db.collection('users').doc(uid).get()).data()!;
    expect(u.walletBalance).toBe(100_000 - 225);
  });

  it('expirePaused expires a timed-out session and credits the astrologer (snapshot commission)', async () => {
    const T = Date.now();
    const cid = 's_2', uid = 'us_2', astro = 'as_2';
    await db.collection('astrologers').doc(astro).set({ totalConsultations: 0 });
    await db.collection('astrologers').doc(astro).collection('private').doc('financials')
      .set({ earnings: 0, pendingPayout: 0 });
    // Paused 400s ago (> 300s timeout). Session grossed 900; commission snapshot 20%.
    await db.collection('consultations').doc(cid).set({
      customerId: uid, astrologerId: astro, type: 'chat', status: 'paused',
      pausedAt: Timestamp.fromMillis(T - 400_000), totalCharged: 900, billedSeconds: 60,
      commissionPercent: 20, createdAt: FieldValue.serverTimestamp(),
    });

    await expirePaused(CONFIG, T);

    const c = (await db.collection('consultations').doc(cid).get()).data()!;
    expect(c.status).toBe('expired');
    expect(c.duration).toBe(60);
    const fin = (await db.collection('astrologers').doc(astro).collection('private').doc('financials').get()).data()!;
    expect(fin.earnings).toBe(720);       // 900 * (1 - 0.20)
    expect(fin.pendingPayout).toBe(720);
  });
});
