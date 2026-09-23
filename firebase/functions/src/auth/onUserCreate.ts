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
import { CONSENT_POLICY_VERSION } from './consent';

function generateReferralCode(uid: string): string {
  // Deterministic, collision-resistant, human-friendly.
  const base = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const tail = base.slice(-4).padStart(4, 'X');
  return `ASK${tail}`;
}

/**
 * A stable key for "has THIS person already received the welcome credit?",
 * derived from their phone (preferred) or email. Phone is normalised to digits
 * only so formatting differences never mint a second key. Returns null when
 * neither is usable (then we can't dedupe and fall back to the per-account flag).
 */
function welcomeIdentityKey(phone?: string, email?: string): string | null {
  const p = String(phone ?? '').replace(/\D/g, '');
  if (p.length >= 8) return `p:${p}`;
  const e = String(email ?? '').trim().toLowerCase();
  if (e.includes('@')) return `e:${e}`;
  return null;
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

  // Record consent at account creation. The app gates EVERY sign-in path
  // (phone/Google/Apple) behind the Terms & Privacy checkbox, so a profile only
  // ever comes into existence after the user agreed — capture that as a
  // versioned, timestamped record (DPDP §6). The recordConsent callable handles
  // later re-consent when the policy version bumps.
  if (data.consent == null) {
    patch.consent = {
      agreed: true,
      policyVersion: CONSENT_POLICY_VERSION,
      at: FieldValue.serverTimestamp(),
      source: 'signup',
    };
  }

  // Welcome bonus: grant N free CHAT minutes exactly once. It lands in
  // `chatBonusBalance` (chat-only) so it cannot be spent on a voice/video call —
  // only on the first chat. `bonusBalance` stays the any-type bonus bucket.
  const config = await getGlobalConfig();
  // The welcome gift is a DIRECT rupee amount when set on the Pricing page
  // (welcomeCreditPaise); otherwise fall back to the legacy freeChatMinutes ×
  // price. Server-capped so a portal typo can never mint a huge free credit.
  const WELCOME_CREDIT_CEILING_PAISE = 50000; // ₹500 hard cap
  const rawWelcome = config.welcomeCreditPaise != null
    ? config.welcomeCreditPaise
    : (config.freeChatMinutes ?? 0) * config.consultationPricePerMinutePaise;
  const welcomeBonus = Math.max(0, Math.min(Math.round(rawWelcome), WELCOME_CREDIT_CEILING_PAISE));
  const priorBonus = (data.chatBonusBalance as number | undefined) ?? 0;

  // Welcome credit is granted ONCE PER IDENTITY (phone/email), not once per
  // account. Someone who deletes their account and signs up again with the same
  // number gets a fresh account but NO second welcome credit — this closes
  // welcome-credit farming by re-registration. The grant is recorded in
  // `welcomeGrants`, keyed by the identity; that record is intentionally NEVER
  // removed when an account is deleted (delete_customer.mjs leaves it), so a
  // re-signup stays creditless. If we can't derive an identity key (neither
  // phone nor email present), we fall back to the old per-account behaviour.
  const identityKey = welcomeIdentityKey(
    data.phone as string | undefined,
    data.email as string | undefined,
  );
  let grantWelcome = false;
  if (!data.signupBonusGranted && welcomeBonus > 0) {
    if (!identityKey) {
      grantWelcome = true; // no identity to dedupe on — behave as before
    } else {
      try {
        grantWelcome = await db.runTransaction(async (tx) => {
          const ledgerRef = db.collection('welcomeGrants').doc(identityKey);
          const led = await tx.get(ledgerRef);
          if (led.exists) return false; // this number/email already got the welcome credit
          tx.set(ledgerRef, {
            key: identityKey,
            phone: (data.phone as string | undefined) ?? null,
            email: (data.email as string | undefined) ?? null,
            uid,
            amountPaise: welcomeBonus,
            grantedAt: FieldValue.serverTimestamp(),
          });
          return true;
        });
      } catch {
        // Ledger check failed (transient) — do NOT grant on uncertainty, so a
        // retry can never double-credit. Better to miss a credit than farm one.
        grantWelcome = false;
      }
    }
  }

  if (grantWelcome) {
    patch.chatBonusBalance = priorBonus + welcomeBonus;
    patch.signupBonusGranted = true;
  } else if (data.chatBonusBalance == null) {
    patch.chatBonusBalance = 0;
  }
  if (data.bonusBalance == null) patch.bonusBalance = 0;

  await db.collection(Collections.users).doc(uid).set(patch, { merge: true });

  // Append an immutable consent-trail row (only for a genuinely new consent).
  if (patch.consent) {
    await db.collection('consentRecords').add({
      userId: uid,
      policyVersion: CONSENT_POLICY_VERSION,
      source: 'signup',
      createdAt: FieldValue.serverTimestamp(),
    });
  }

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
