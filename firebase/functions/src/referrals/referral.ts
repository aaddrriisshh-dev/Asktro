/**
 * Referral rewards. Credited once, on the referred user's FIRST successful
 * recharge. Both the referrer and the referred user receive a bonus (amounts
 * configurable). Runs inside the recharge transaction so it can't double-fire.
 */
import { Transaction } from 'firebase-admin/firestore';
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { writeLedger } from '../wallet/ledger';

// Reward amounts in paise. Admin-configurable via config/global in future;
// kept here as defaults matching the referral program spec (Part 6).
const REFERRER_REWARD_PAISE = 5000; // ₹50
const REFERRED_REWARD_PAISE = 2500; // ₹25

/** What the write phase needs, resolved during the transaction's read phase. */
export interface ReferralCredit {
  referrerId: string;
  referrerRef: FirebaseFirestore.DocumentReference;
  referralRef: FirebaseFirestore.DocumentReference;
}

/**
 * READ phase — resolve the referrer and decide if a credit is due. Must run
 * before any transaction writes (Firestore requires all reads first). Returns
 * null when nothing should be credited.
 */
export async function readReferralCredit(
  tx: Transaction,
  params: { referredUserId: string; referrerCode: string },
): Promise<ReferralCredit | null> {
  const { referredUserId, referrerCode } = params;

  // Resolve the referrer by their referral code.
  const referrerQ = await tx.get(
    db.collection(Collections.users).where('referralCode', '==', referrerCode).limit(1),
  );
  if (referrerQ.empty) return null;
  const referrerRef = referrerQ.docs[0].ref;
  const referrerId = referrerQ.docs[0].id;
  if (referrerId === referredUserId) return null; // no self-referral

  // Guard against a second credit for this pair.
  const existing = await tx.get(
    db
      .collection(Collections.referrals)
      .where('referrerId', '==', referrerId)
      .where('referredId', '==', referredUserId)
      .limit(1),
  );
  if (!existing.empty && existing.docs[0].data().status === 'credited') return null;

  const referralRef = existing.empty ? db.collection(Collections.referrals).doc() : existing.docs[0].ref;
  return { referrerId, referrerRef, referralRef };
}

/** WRITE phase — apply the referral credit resolved by readReferralCredit. */
export function applyReferralCredit(
  tx: Transaction,
  credit: ReferralCredit,
  params: { referredUserId: string; paymentId: string },
): void {
  const { referredUserId, paymentId } = params;
  const { referrerId, referrerRef, referralRef } = credit;

  // Credit both wallets (as bonus balance).
  tx.update(referrerRef, {
    bonusBalance: FieldValue.increment(REFERRER_REWARD_PAISE),
    updatedAt: FieldValue.serverTimestamp(),
  });
  tx.update(db.collection(Collections.users).doc(referredUserId), {
    bonusBalance: FieldValue.increment(REFERRED_REWARD_PAISE),
    updatedAt: FieldValue.serverTimestamp(),
  });

  writeLedger(tx, {
    userId: referrerId,
    kind: 'bonus',
    amount: REFERRER_REWARD_PAISE,
    balanceBefore: 0,
    balanceAfter: 0,
    refId: paymentId,
    note: 'Referral reward',
  });
  writeLedger(tx, {
    userId: referredUserId,
    kind: 'bonus',
    amount: REFERRED_REWARD_PAISE,
    balanceBefore: 0,
    balanceAfter: 0,
    refId: paymentId,
    note: 'Referral welcome bonus',
  });

  tx.set(referralRef, {
    referrerId,
    referredId: referredUserId,
    referrerReward: REFERRER_REWARD_PAISE,
    referredReward: REFERRED_REWARD_PAISE,
    status: 'credited',
    triggeredByPaymentId: paymentId,
    createdAt: FieldValue.serverTimestamp(),
  });
}
