/**
 * recordConsent — persists a verifiable record that the user agreed to the
 * Terms & Privacy Policy. DPDP 2023 §6 / GDPR require recorded, versioned,
 * timestamped consent for processing personal (and here, special-category
 * birth) data. The login checkbox alone (local UI state) is not a record; this
 * makes it one.
 *
 * Writes the current consent onto the user doc AND appends an immutable row to
 * `consentRecords` so a withdrawn/updated consent still leaves an audit trail.
 * The policy version is authoritative server-side — the client cannot backdate
 * or fake which version it agreed to.
 */
import { onCall } from 'firebase-functions/v2/https';
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { assertAuthed } from '../common/errors';

/** Bump when Terms/Privacy materially change so re-consent can be required. */
export const CONSENT_POLICY_VERSION = '2026-07-10';

export const recordConsent = onCall(async (req) => {
  const uid = assertAuthed(req);
  const { termsAccepted, privacyAccepted } = (req.data ?? {}) as {
    termsAccepted?: boolean;
    privacyAccepted?: boolean;
  };

  const consent = {
    agreed: true,
    termsAccepted: termsAccepted !== false,
    privacyAccepted: privacyAccepted !== false,
    policyVersion: CONSENT_POLICY_VERSION,
    at: FieldValue.serverTimestamp(),
  };

  // Current consent on the profile (merge so it never disturbs money fields).
  await db.collection(Collections.users).doc(uid).set({ consent, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  // Immutable append-only trail.
  await db.collection('consentRecords').add({
    userId: uid,
    policyVersion: CONSENT_POLICY_VERSION,
    termsAccepted: consent.termsAccepted,
    privacyAccepted: consent.privacyAccepted,
    source: 'app',
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, policyVersion: CONSENT_POLICY_VERSION };
});
