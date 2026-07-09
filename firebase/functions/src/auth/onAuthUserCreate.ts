/**
 * onAuthUserCreate — the authoritative, network-independent guarantee that every
 * account has a profile. Fires on Google's servers the moment a Firebase Auth
 * user is created (phone / Google / Apple / email), so it does NOT depend on the
 * client's device or connection ever completing a write.
 *
 * The client also creates the profile (for instant UX), but that write can fail
 * to reach the server on a flaky network — leaving the user authenticated with
 * no profile. This server-side trigger closes that hole: if the profile doc is
 * missing, it creates it. The existing `onCustomerSignup` Firestore trigger then
 * backfills the referral code and grants the welcome bonus (idempotently).
 *
 * Auth triggers are a Gen1 product; this coexists with the Gen2 callables.
 */
import * as functionsV1 from 'firebase-functions/v1';
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';

export const onAuthUserCreate = functionsV1
  .region('asia-south1')
  .auth.user()
  .onCreate(async (user) => {
    const uid = user.uid;
    const ref = db.collection(Collections.users).doc(uid);

    try {
      const snap = await ref.get();
      if (snap.exists) return; // client already created it — nothing to do

      // Create with zeroed, function-owned money fields. `onCustomerSignup`
      // (triggered by this creation) backfills referralCode + welcome bonus.
      await ref.set(
        {
          name: user.displayName || 'Guest',
          phone: user.phoneNumber || '',
          email: user.email || null,
          walletBalance: 0,
          bonusBalance: 0,
          chatBonusBalance: 0,
          lockedBalance: 0,
          totalRecharge: 0,
          totalSpent: 0,
          totalConsultations: 0,
          pendingRefund: 0,
          accountStatus: 'active',
          notificationEnabled: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err) {
      // Never throw — a failure here must not block sign-up. Logged for triage.
      console.error(`onAuthUserCreate: failed to ensure profile for ${uid}`, err);
    }
  });
