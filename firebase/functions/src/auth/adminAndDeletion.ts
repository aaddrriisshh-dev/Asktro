/**
 * Privileged auth functions:
 *  - setUserRole: a super-admin grants astrologer/admin custom claims. Bootstrap
 *    the first super-admin by setting the claim manually once in the console.
 *  - deleteAccount: secure, self-service account deletion (Part 3). Removes the
 *    profile, notifications and FCM tokens, anonymizes historical consultations
 *    (kept for the astrologer's records/audit), and deletes the Auth user.
 */
import { onCall } from 'firebase-functions/v2/https';
import { auth, db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { assertAuthed, assertRole, badRequest, failedPrecondition } from '../common/errors';

export const setUserRole = onCall(async (req) => {
  assertRole(req, 'admin');
  if (req.auth?.token?.adminRole !== 'super') {
    failedPrecondition('Only a super-admin may change roles.');
  }
  const { targetUid, role, adminRole, approved } = (req.data ?? {}) as {
    targetUid?: string;
    role?: 'astrologer' | 'admin' | 'customer';
    adminRole?: string;
    approved?: boolean;
  };
  if (!targetUid || !role) badRequest('targetUid and role are required.');

  const claims: Record<string, unknown> =
    role === 'customer'
      ? {}
      : role === 'astrologer'
        ? { role: 'astrologer', approved: approved ?? false }
        : { role: 'admin', adminRole: adminRole ?? 'ops' };

  await auth.setCustomUserClaims(targetUid!, claims);

  await db.collection(Collections.auditLogs).add({
    actorUid: req.auth!.uid,
    actorRole: 'admin',
    action: 'setUserRole',
    targetType: 'user',
    targetId: targetUid,
    after: claims,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

export const deleteAccount = onCall(async (req) => {
  const uid = assertAuthed(req);

  // Block deletion while a consultation is open.
  const open = await db
    .collection(Collections.consultations)
    .where('customerId', '==', uid)
    .where('status', 'in', ['waiting', 'active', 'paused'])
    .limit(1)
    .get();
  if (!open.empty) failedPrecondition('Finish your active consultation before deleting your account.');

  // Mark deleted + scrub PII from the profile (keep the doc id for referential
  // integrity of historical consultations/ledger).
  await db.collection(Collections.users).doc(uid).set(
    {
      name: 'Deleted user',
      phone: FieldValue.delete(),
      email: FieldValue.delete(),
      profilePhoto: FieldValue.delete(),
      fcmTokens: [],
      accountStatus: 'deleted',
      notificationEnabled: false,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // Remove notifications.
  const notifs = await db.collection(Collections.notifications).where('userId', '==', uid).limit(500).get();
  const batch = db.batch();
  notifs.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  await db.collection(Collections.auditLogs).add({
    actorUid: uid,
    actorRole: 'customer',
    action: 'deleteAccount',
    targetType: 'user',
    targetId: uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  // Finally delete the Auth user.
  await auth.deleteUser(uid);

  return { ok: true };
});
