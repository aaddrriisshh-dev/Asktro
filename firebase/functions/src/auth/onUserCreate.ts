/**
 * onCustomerSignup — Firestore-triggered when a `users/{uid}` doc is created by
 * the client (with zeroed money fields, enforced by rules). Backfills a unique
 * referral code and canonical defaults that the client must not set itself.
 *
 * We key profile creation off the Firestore doc (not the Auth trigger) so the
 * same flow works for phone/Google/Apple sign-in and is testable in the
 * emulator without the blocking-functions setup.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { getGlobalConfig } from '../common/config';

function generateReferralCode(uid: string): string {
  // Deterministic, collision-resistant, human-friendly.
  const base = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const tail = base.slice(-4).padStart(4, 'X');
  return `ASK${tail}`;
}

export const onCustomerSignup = onDocumentCreated('users/{uid}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data();
  const uid = event.params.uid;

  const patch: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (!data.referralCode) patch.referralCode = generateReferralCode(uid);
  if (data.walletBalance == null) patch.walletBalance = 0;
  if (data.lockedBalance == null) patch.lockedBalance = 0;
  if (data.totalRecharge == null) patch.totalRecharge = 0;
  if (data.totalSpent == null) patch.totalSpent = 0;
  if (data.totalConsultations == null) patch.totalConsultations = 0;
  if (data.pendingRefund == null) patch.pendingRefund = 0;
  if (data.accountStatus == null) patch.accountStatus = 'active';
  if (data.createdAt == null) patch.createdAt = FieldValue.serverTimestamp();

  // Welcome bonus: grant N free CHAT minutes exactly once. It lands in
  // `chatBonusBalance` (chat-only) so it cannot be spent on a voice/video call —
  // only on the first chat. `bonusBalance` stays the any-type bonus bucket.
  const config = await getGlobalConfig();
  const welcomeBonus = (config.freeChatMinutes ?? 0) * config.consultationPricePerMinutePaise;
  const priorBonus = (data.chatBonusBalance as number | undefined) ?? 0;
  if (!data.signupBonusGranted && welcomeBonus > 0) {
    patch.chatBonusBalance = priorBonus + welcomeBonus;
    patch.signupBonusGranted = true;
  } else if (data.chatBonusBalance == null) {
    patch.chatBonusBalance = 0;
  }
  if (data.bonusBalance == null) patch.bonusBalance = 0;

  await db.collection(Collections.users).doc(uid).set(patch, { merge: true });

  // Record the welcome bonus in the ledger so it shows in transaction history.
  if (patch.signupBonusGranted) {
    await db.collection(Collections.walletTransactions).add({
      userId: uid,
      kind: 'bonus',
      amount: welcomeBonus,
      balanceBefore: priorBonus,
      balanceAfter: priorBonus + welcomeBonus,
      refId: 'signup_bonus',
      note: `Welcome bonus — ${config.freeChatMinutes} free chat minutes`,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
});
