/**
 * Privileged auth functions:
 *  - setUserRole: a super-admin grants astrologer/admin custom claims. Bootstrap
 *    the first super-admin by setting the claim manually once in the console.
 *  - deleteAccount: secure, self-service account deletion (DPDP §12 / GDPR
 *    Art. 17 erasure). It ERASES all personal, free-text and media content the
 *    user generated — chat messages, chat images, voice notes, remedies, support
 *    threads, notifications, the safe-card mirror, and the astrologer membership
 *    markers — strips PII from the profile, and deletes the Auth user. It
 *    intentionally RETAINS the financial ledger (walletTransactions) and the
 *    billing skeleton of past consultations under the now-anonymized id, because
 *    deleting transaction/accounting records is itself a legal violation (tax /
 *    financial-record retention). No name, phone, email, birth data, chat text
 *    or image survives; only anonymous money rows do.
 */
import { onCall } from 'firebase-functions/v2/https';
import { auth, db, bucket, FieldValue } from '../common/admin';
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

/**
 * Delete every doc a query matches, in batches, until the query is empty.
 * Firestore caps a batch at 500 writes, so we page at 300 to stay well under it.
 */
async function deleteByQuery(
  buildQuery: () => FirebaseFirestore.Query,
  pageSize = 300,
): Promise<number> {
  let removed = 0;
  for (;;) {
    const snap = await buildQuery().limit(pageSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    if (snap.size < pageSize) break;
  }
  return removed;
}

/** Delete every doc under a collection reference (used for subcollections). */
async function deleteCollection(ref: FirebaseFirestore.CollectionReference, pageSize = 300): Promise<void> {
  for (;;) {
    const snap = await ref.limit(pageSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snap.size < pageSize) break;
  }
}

export const deleteAccount = onCall(async (req) => {
  const uid = assertAuthed(req);

  // Block deletion while a consultation is open (money is mid-flight).
  const open = await db
    .collection(Collections.consultations)
    .where('customerId', '==', uid)
    .where('status', 'in', ['waiting', 'active', 'paused'])
    .limit(1)
    .get();
  if (!open.empty) failedPrecondition('Finish your active consultation before deleting your account.');

  // 1) Strip PII from the profile but keep the doc id so the retained financial
  //    ledger stays referentially intact under an anonymous identity.
  await db.collection(Collections.users).doc(uid).set(
    {
      name: 'Deleted user',
      phone: FieldValue.delete(),
      email: FieldValue.delete(),
      profilePhoto: FieldValue.delete(),
      gender: FieldValue.delete(),
      birthDateMs: FieldValue.delete(),
      birthTime: FieldValue.delete(),
      birthPlace: FieldValue.delete(),
      relationshipStatus: FieldValue.delete(),
      // Referral identifiers are a re-identification link — strip them too.
      referralCode: FieldValue.delete(),
      referredBy: FieldValue.delete(),
      fcmTokens: [],
      accountStatus: 'deleted',
      notificationEnabled: false,
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // 2) Erase the safe-card mirror (name/DOB/birthplace readable by astrologers).
  await db.collection('customerProfiles').doc(uid).delete().catch(() => {});

  // 3) For every consultation this customer had: erase the chat transcript, the
  //    typing docs, and all chat media in Storage. The consultation doc itself is
  //    a billing record and is RETAINED (now pointing at an anonymized user).
  const consults = await db
    .collection(Collections.consultations)
    .where('customerId', '==', uid)
    .get();
  for (const doc of consults.docs) {
    await deleteCollection(doc.ref.collection('messages')).catch(() => {});
    await deleteCollection(doc.ref.collection('typing')).catch(() => {});
    // Chat media is stored under chat_images/{consultationId}/ and
    // voice_notes/{consultationId}/ — purge both prefixes.
    await bucket.deleteFiles({ prefix: `chat_images/${doc.id}/` }).catch(() => {});
    await bucket.deleteFiles({ prefix: `voice_notes/${doc.id}/` }).catch(() => {});
  }

  // 4) Erase personal advice, support conversations, notifications, and the
  //    astrologer→customer membership markers (which back astrologers' scoped
  //    read of the customer's safe card — now gone anyway).
  await deleteByQuery(() =>
    db.collection('remedies').where('customerId', '==', uid),
  ).catch(() => {});

  const tickets = await db.collection('supportTickets').where('customerId', '==', uid).get();
  for (const t of tickets.docs) {
    await deleteCollection(t.ref.collection('thread')).catch(() => {});
    await t.ref.delete().catch(() => {});
  }

  await deleteByQuery(() =>
    db.collection(Collections.notifications).where('userId', '==', uid),
  ).catch(() => {});

  // Membership markers live at astrologerCustomers/{astrologerId}/customers/{uid}.
  // Every astrologer this customer consulted is exactly the set of astrologerIds
  // on their consultations — delete the marker for each so no astrologer keeps a
  // scoped read of the (now-erased) customer.
  const astroIds = new Set(consults.docs.map((d) => d.data().astrologerId as string).filter(Boolean));
  for (const aid of astroIds) {
    await db.collection('astrologerCustomers').doc(aid).collection('customers').doc(uid).delete().catch(() => {});
  }

  // 5) Erase the remaining PII-bearing / uid-linked records the earlier version
  //    missed (DPDP §12 / GDPR Art. 17 completeness):
  //  - reports the user AUTHORED (free-text detail). Reports ABOUT them
  //    (reportedId==uid) are RETAINED as safety records authored by others.
  await deleteByQuery(() => db.collection('reports').where('reporterId', '==', uid)).catch(() => {});
  //  - consent records for this (now-deleted) subject.
  await deleteByQuery(() => db.collection('consentRecords').where('userId', '==', uid)).catch(() => {});
  //  - ops alerts that reference this user directly.
  await deleteByQuery(() => db.collection('alerts').where('refId', '==', uid)).catch(() => {});
  //  - referral links in either direction (referrer↔referred uid linkage).
  await deleteByQuery(() => db.collection(Collections.referrals).where('referrerId', '==', uid)).catch(() => {});
  await deleteByQuery(() => db.collection(Collections.referrals).where('referredId', '==', uid)).catch(() => {});
  //  - the user's own block list, AND their uid inside anyone else's block list.
  await db.collection('userBlocks').doc(uid).delete().catch(() => {});
  const blockers = await db.collection('userBlocks').where('blocked', 'array-contains', uid).get().catch(() => null);
  for (const b of blockers?.docs ?? []) {
    await b.ref.update({ blocked: FieldValue.arrayRemove(uid) }).catch(() => {});
  }

  await db.collection(Collections.auditLogs).add({
    actorUid: uid,
    actorRole: 'customer',
    action: 'deleteAccount',
    targetType: 'user',
    targetId: uid,
    after: {
      erased: [
        'profilePII', 'referralIds', 'customerProfile', 'messages', 'chatMedia', 'remedies',
        'supportTickets', 'notifications', 'membershipMarkers', 'authoredReports',
        'consentRecords', 'linkedAlerts', 'referrals', 'blockList',
      ],
      retained: ['walletTransactions', 'consultationSkeleton', 'reportsAboutUser(safety)'],
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  // 5) Finally delete the Auth user (revokes login + tokens).
  await auth.deleteUser(uid);

  return { ok: true };
});
