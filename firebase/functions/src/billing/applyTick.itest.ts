/**
 * Integration tests for applyTick against the Firestore emulator — the billing
 * heartbeat's money movement. Verifies:
 *  - the chat-only welcome credit is spent before the any-type bonus and wallet;
 *  - a customer is never charged beyond spendable, and exhaustion pauses;
 *  - the CUSTOMER-PRESENCE GATE (P0-1): an astrologer-only heartbeat cannot bill
 *    past the customer's last confirmed tick + a short settle window, so an
 *    absent (force-quit) customer's wallet is not drained;
 *  - the SINGLE-TICK CLAMP (P1-2): one catch-up tick after a long freeze bills at
 *    most the settle window, never the whole silent gap.
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

/** Seed an active chat session. `agoMs` sets both lastTickAt and customerLastTickAt. */
async function seedSession(
  cid: string,
  uid: string,
  agoMs: number,
  opts: { wallet?: number; anyBonus?: number; chatBonus?: number; eligible?: boolean } = {},
) {
  await db.collection('users').doc(uid).set({
    walletBalance: opts.wallet ?? 0,
    bonusBalance: opts.anyBonus ?? 0,
    chatBonusBalance: opts.chatBonus ?? 0,
    chatGraceUsed: false,
  });
  const t = Timestamp.fromMillis(Date.now() - agoMs);
  await db.collection('consultations').doc(cid).set({
    customerId: uid, astrologerId: 'a1', type: 'chat', chatCreditEligible: opts.eligible ?? true,
    status: 'active', pricePerMinute: 900, billedSeconds: 0, totalCharged: 0,
    lastTickAt: t, customerLastTickAt: t,
    createdAt: FieldValue.serverTimestamp(),
  });
}

describe('applyTick (emulator)', () => {
  it('customer tick spends chat bonus first, caps at spendable, and pauses on exhaustion', async () => {
    const uid = 'u_tick_1'; const cid = 'c_tick_1';
    // Spendable = 0 wallet + 50 any-bonus + 100 chat-bonus = 150 paise = 10s @ 900/min.
    // 15s elapsed wants 225p but only 150 is spendable → bill 10s / 150p, then pause.
    await seedSession(cid, uid, 15_000, { wallet: 0, anyBonus: 50, chatBonus: 100 });

    const out = await db.runTransaction((tx) => applyTick(tx, cid, CONFIG, Date.now(), undefined, true));
    expect(out).not.toBeNull();
    expect(out!.status).toBe('paused');
    expect(out!.billedSeconds).toBe(10);
    expect(out!.chargedPaise).toBe(150);

    const u = (await db.collection('users').doc(uid).get()).data()!;
    expect(u.chatBonusBalance).toBe(0); // chat bonus (100) spent first
    expect(u.bonusBalance).toBe(0);     // then any bonus (50)
    expect(u.walletBalance).toBe(0);

    const c = (await db.collection('consultations').doc(cid).get()).data()!;
    expect(c.status).toBe('paused');
    expect(c.totalCharged).toBe(150);
  });

  it('does not touch the chat-only bucket for an ineligible (premium) chat', async () => {
    const uid = 'u_tick_2'; const cid = 'c_tick_2';
    await seedSession(cid, uid, 10_000, { wallet: 1000, chatBonus: 500, eligible: false });

    await db.runTransaction((tx) => applyTick(tx, cid, CONFIG, Date.now(), undefined, true));
    const u = (await db.collection('users').doc(uid).get()).data()!;
    expect(u.chatBonusBalance).toBe(500); // untouched
    expect(u.walletBalance).toBe(850);    // 1000 - 150 (10s @ 900/min)
  });

  it('P0-1: an astrologer-only heartbeat cannot bill past the customer presence frontier', async () => {
    const uid = 'u_tick_3'; const cid = 'c_tick_3';
    // Customer left 60s ago (lastTick + customerLastTick = now-60). Wallet is huge.
    await seedSession(cid, uid, 60_000, { wallet: 100_000 });

    // Astrologer tick (tickedByCustomer=false): may bill only up to customer's
    // last tick + 15s settle = 15s of the 60s gap, NOT the whole gap.
    const first = await db.runTransaction((tx) => applyTick(tx, cid, CONFIG, Date.now(), undefined, false));
    expect(first!.billedSeconds).toBe(15);
    expect(first!.chargedPaise).toBe(225); // 15s @ 900/min

    // A SECOND astrologer tick bills nothing — the meter has reached the frontier
    // and halts until the customer returns. The absent customer is not drained.
    const second = await db.runTransaction((tx) => applyTick(tx, cid, CONFIG, Date.now(), undefined, false));
    expect(second!.billedSeconds).toBe(0);
    expect(second!.chargedPaise).toBe(0);

    const u = (await db.collection('users').doc(uid).get()).data()!;
    expect(u.walletBalance).toBe(100_000 - 225); // only the 15s settle, ever
  });

  it('P1-2: a single customer catch-up tick after a long freeze is clamped to the settle window', async () => {
    const uid = 'u_tick_4'; const cid = 'c_tick_4';
    // Customer app was OS-suspended 90s, then foregrounds and fires one tick.
    await seedSession(cid, uid, 90_000, { wallet: 100_000 });

    const out = await db.runTransaction((tx) => applyTick(tx, cid, CONFIG, Date.now(), undefined, true));
    expect(out!.billedSeconds).toBe(15);   // clamped, NOT 90
    expect(out!.chargedPaise).toBe(225);
  });
});
