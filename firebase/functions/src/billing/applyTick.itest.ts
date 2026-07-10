/**
 * Integration tests for applyTick against the Firestore emulator — the billing
 * heartbeat's money movement. Verifies the chat-only welcome credit is spent
 * before the any-type bonus and the wallet, that a customer is never charged
 * beyond spendable, and that exhaustion pauses the session.
 */
import { db, FieldValue, Timestamp } from '../common/admin';
import { applyTick } from './tickConsultation';
import { GlobalConfig } from '../common/types';

const CONFIG: GlobalConfig = {
  consultationPricePerMinutePaise: 900,
  minWalletToStartPaise: 1800,
  warnLevel1Sec: 60,
  warnLevel2Sec: 20,
  reconnectTimeoutSec: 45,
  sessionTimeoutSec: 300,
  requestTimeoutSec: 90,
  commissionPercent: 20,
  freeChatMinutes: 3,
  graceMinutes: 0, // disable grace so exhaustion pauses deterministically
  featureFlags: { voice: true, video: true, referrals: true },
};

describe('applyTick (emulator)', () => {
  it('spends chat bonus first, caps at spendable, and pauses on exhaustion', async () => {
    const uid = 'u_tick_1';
    const cid = 'c_tick_1';
    // Spendable = 300 wallet + 100 any-bonus + 200 chat-bonus = 600 paise.
    await db.collection('users').doc(uid).set({
      walletBalance: 300, bonusBalance: 100, chatBonusBalance: 200, chatGraceUsed: false,
    });
    // 60s elapsed at 900p/min (15p/s) would want 900p, but only 600p is spendable
    // → bill 40s / 600p, then pause.
    await db.collection('consultations').doc(cid).set({
      customerId: uid, astrologerId: 'a1', type: 'chat', chatCreditEligible: true,
      status: 'active', pricePerMinute: 900, billedSeconds: 0, totalCharged: 0,
      lastTickAt: Timestamp.fromMillis(Date.now() - 60_000),
      createdAt: FieldValue.serverTimestamp(),
    });

    const outcome = await db.runTransaction((tx) => applyTick(tx, cid, CONFIG, Date.now()));
    expect(outcome).not.toBeNull();
    expect(outcome!.status).toBe('paused');
    expect(outcome!.billedSeconds).toBe(40);
    expect(outcome!.chargedPaise).toBe(600);

    const u = (await db.collection('users').doc(uid).get()).data()!;
    // chat bonus (200) + any bonus (100) consumed first, then 300 from wallet.
    expect(u.chatBonusBalance).toBe(0);
    expect(u.bonusBalance).toBe(0);
    expect(u.walletBalance).toBe(0);

    const c = (await db.collection('consultations').doc(cid).get()).data()!;
    expect(c.status).toBe('paused');
    expect(c.billedSeconds).toBe(40);
    expect(c.totalCharged).toBe(600);
  });

  it('does not touch the chat-only bucket for an ineligible (premium) chat', async () => {
    const uid = 'u_tick_2';
    const cid = 'c_tick_2';
    await db.collection('users').doc(uid).set({
      walletBalance: 1000, bonusBalance: 0, chatBonusBalance: 500,
    });
    await db.collection('consultations').doc(cid).set({
      customerId: uid, astrologerId: 'a1', type: 'chat', chatCreditEligible: false,
      status: 'active', pricePerMinute: 900, billedSeconds: 0, totalCharged: 0,
      lastTickAt: Timestamp.fromMillis(Date.now() - 10_000), // 10s → 150p
      createdAt: FieldValue.serverTimestamp(),
    });

    await db.runTransaction((tx) => applyTick(tx, cid, CONFIG, Date.now()));
    const u = (await db.collection('users').doc(uid).get()).data()!;
    expect(u.chatBonusBalance).toBe(500); // untouched
    expect(u.walletBalance).toBe(850); // 1000 - 150
  });
});
