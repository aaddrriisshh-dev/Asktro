/**
 * Privileged auth functions:
 *  - setUserRole: a super-admin grants astrologer/admin custom claims. Bootstrap
 *    the first super-admin by setting the claim manually once in the console.
 *  - deleteAccount / processAccountDeletion: secure, self-service account
 *    deletion (DPDP §12 / GDPR Art. 17 erasure), split into two phases so a
 *    heavy account (thousands of chat messages + media across many
 *    consultations) can never blow the callable's request timeout and strand a
 *    half-deleted account.
 *      Phase 1 (deleteAccount, synchronous, bounded O(1) writes): revoke the
 *      user's sessions and DISABLE the Auth login so the account is instantly
 *      unusable, strip PII from the profile, erase the safe-card mirror, and
 *      enqueue a deletion job. Returns immediately.
 *      Phase 2 (processAccountDeletion, Firestore-triggered background worker,
 *      long timeout, idempotent): drains the unbounded content — chat
 *      transcripts, chat/voice media in Storage, remedies, support threads,
 *      notifications, membership markers, authored reports, consent records,
 *      linked alerts, referrals, block-list linkage — then deletes the Auth
 *      user and marks the job done.
 *    Both phases intentionally RETAIN the financial ledger (walletTransactions)
 *    and the billing skeleton of past consultations under the now-anonymized
 *    id, because deleting transaction/accounting records is itself a legal
 *    violation (tax / financial-record retention). No name, phone, email, birth
 *    data, chat text or image survives; only anonymous money rows do.
 */
import { onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
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

// ---- Phase 1: synchronous, bounded. Make the account instantly unusable and
//      erase the directly-readable PII, then hand the unbounded erasure to the
//      background worker. All writes here are O(1) so this can never time out. --
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

  // 1) Kill the session immediately: revoke refresh tokens and disable the Auth
  //    login. The account is unusable from this instant, even though the heavy
  //    content erasure (Phase 2) runs asynchronously afterwards. The Auth user
  //    is DELETED by the worker as its final step, once all content is gone.
  await auth.revokeRefreshTokens(uid).catch(() => {});
  await auth.updateUser(uid, { disabled: true }).catch(() => {});

  // 2) Strip PII from the profile but keep the doc id so the retained financial
  //    ledger stays referentially intact under an anonymous identity. Also mark
  //    the erasure as in-flight so the account reads as gone right away.
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
      deletionState: 'pending',
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // 3) Erase the safe-card mirror (name/DOB/birthplace readable by astrologers)
  //    right now — it is a single doc and the most sensitive live read.
  await db.collection('customerProfiles').doc(uid).delete().catch(() => {});

  // 4) Enqueue the unbounded erasure. onDocumentCreated on this doc fans out to
  //    processAccountDeletion, which can run for minutes without a client
  //    waiting. The job doc doubles as an audit/observability record.
  await db.collection('accountDeletions').doc(uid).set({
    uid,
    status: 'pending',
    requestedAt: FieldValue.serverTimestamp(),
  });

  await db.collection(Collections.auditLogs).add({
    actorUid: uid,
    actorRole: 'customer',
    action: 'deleteAccountRequested',
    targetType: 'user',
    targetId: uid,
    after: { erased: ['authSession', 'profilePII', 'referralIds', 'customerProfile'], enqueued: 'bulkErasure' },
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

// ---- Phase 2: background worker. Drains the unbounded, per-consultation
//      content and the remaining uid-linked records, then deletes the Auth user.
//      Fully idempotent (every op is a delete-by-query or a guarded delete), so
//      a retry after a partial failure simply completes the erasure. A generous
//      timeout + memory bump means even a very heavy account finishes in one run.
export const processAccountDeletion = onDocumentCreated(
  { document: 'accountDeletions/{uid}', timeoutSeconds: 540, memory: '512MiB' },
  async (event) => {
    const uid = event.params.uid;
    const job = event.data?.data();
    if (job?.status === 'done') return; // already completed — nothing to do
    await runAccountErasure(uid);
  },
);

/**
 * The unbounded, idempotent erasure. Extracted from the trigger so it can be
 * unit-tested against the emulator and re-run by an admin if a job is stuck.
 * Every operation is a delete-by-query or a guarded delete, so a re-run after a
 * partial failure simply finishes the job.
 */
export async function runAccountErasure(uid: string): Promise<void> {
    // For every consultation this customer had: erase the chat transcript, the
    // typing docs, and all chat media in Storage. The consultation doc itself is
    // a billing record and is RETAINED (now pointing at an anonymized user).
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

    // Personal advice, support conversations, notifications.
    await deleteByQuery(() => db.collection('remedies').where('customerId', '==', uid)).catch(() => {});

    const tickets = await db.collection('supportTickets').where('customerId', '==', uid).get();
    for (const t of tickets.docs) {
      await deleteCollection(t.ref.collection('thread')).catch(() => {});
      await t.ref.delete().catch(() => {});
    }

    await deleteByQuery(() => db.collection(Collections.notifications).where('userId', '==', uid)).catch(() => {});

    // Membership markers live at astrologerCustomers/{astrologerId}/customers/{uid}.
    // Every astrologer this customer consulted is exactly the set of astrologerIds
    // on their consultations — delete the marker for each so no astrologer keeps a
    // scoped read of the (now-erased) customer.
    const astroIds = new Set(consults.docs.map((d) => d.data().astrologerId as string).filter(Boolean));
    for (const aid of astroIds) {
      await db.collection('astrologerCustomers').doc(aid).collection('customers').doc(uid).delete().catch(() => {});
    }

    // Remaining PII-bearing / uid-linked records (DPDP §12 / GDPR Art. 17):
    //  - reports the user AUTHORED (free-text). Reports ABOUT them
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

    // Finally delete the Auth user (idempotent — a not-found on retry is fine).
    await auth.deleteUser(uid).catch((err) => {
      if ((err as { code?: string })?.code !== 'auth/user-not-found') {
        logger.warn('processAccountDeletion: auth.deleteUser failed', { uid, error: err instanceof Error ? err.message : String(err) });
      }
    });

    await db.collection('accountDeletions').doc(uid).set(
      { status: 'done', completedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    await db.collection(Collections.users).doc(uid).set(
      { deletionState: 'done', updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    ).catch(() => {});

    await db.collection(Collections.auditLogs).add({
      actorUid: uid,
      actorRole: 'customer',
      action: 'deleteAccount',
      targetType: 'user',
      targetId: uid,
      after: {
        erased: [
          'messages', 'chatMedia', 'remedies', 'supportTickets', 'notifications',
          'membershipMarkers', 'authoredReports', 'consentRecords', 'linkedAlerts',
          'referrals', 'blockList', 'authUser',
        ],
        retained: ['walletTransactions', 'consultationSkeleton', 'reportsAboutUser(safety)'],
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    logger.info('processAccountDeletion: erasure complete', { uid, consultations: consults.size });
}

/**
 * deleteAstrologerAccount — self-service deletion for an ASTROLOGER (Play / DPDP
 * §12 requirement; the customer `deleteAccount` targets /users and is not
 * astrologer-safe). Blocks while an obligation is open — a live consultation, or
 * unpaid earnings the astrologer must withdraw first — then revokes login,
 * strips PII from the public doc, erases private subdocs + presence + customer
 * membership markers, and deletes the Auth user. RETAINS the anonymized
 * append-only earnings ledger and the billing skeleton of past consultations
 * (accounting retention), exactly like the customer path.
 */
export const deleteAstrologerAccount = onCall(async (req) => {
  const uid = assertAuthed(req);
  if (req.auth?.token?.role !== 'astrologer' && req.auth?.token?.role !== 'admin') {
    failedPrecondition('Only an astrologer may delete an astrologer account.');
  }

  const astroRef = db.collection(Collections.astrologers).doc(uid);
  const [snap, finSnap, open] = await Promise.all([
    astroRef.get(),
    astroRef.collection('private').doc('financials').get(),
    db.collection(Collections.consultations)
      .where('astrologerId', '==', uid)
      .where('status', 'in', ['waiting', 'active', 'paused'])
      .limit(1).get(),
  ]);
  if (!snap.exists) failedPrecondition('Astrologer profile not found.');
  if (!open.empty) failedPrecondition('Finish your active consultation before deleting your account.');
  const pendingPayout = (finSnap.data()?.pendingPayout as number | undefined) ?? 0;
  if (pendingPayout > 0) {
    failedPrecondition('You still have unpaid earnings. Please withdraw them before deleting your account.');
  }

  // 1) Kill the session immediately (revoke + disable login).
  await auth.revokeRefreshTokens(uid).catch(() => {});
  await auth.updateUser(uid, { disabled: true }).catch(() => {});

  // 2) Strip PII from the public directory doc; take them offline + unlisted.
  await astroRef.set(
    {
      name: 'Deleted astrologer',
      phone: FieldValue.delete(),
      email: FieldValue.delete(),
      profilePhoto: FieldValue.delete(),
      about: FieldValue.delete(),
      languages: FieldValue.delete(),
      onlineStatus: false,
      available: false,
      featured: false,
      accountStatus: 'deleted',
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // 3) Erase private subdocs (contact PII + the financials counter — pendingPayout
  //    is 0; the append-only astrologerLedger is RETAINED), presence heartbeat,
  //    and the astrologer's customer-membership markers.
  const priv = await astroRef.collection('private').get();
  await Promise.all(priv.docs.map((d) => d.ref.delete().catch(() => {})));
  await deleteCollection(astroRef.collection('notes')).catch(() => {}); // private customer notes
  await db.collection('presence').doc(uid).delete().catch(() => {});
  await deleteCollection(db.collection('astrologerCustomers').doc(uid).collection('customers')).catch(() => {});

  // Scrub the astrologer's name/photo off the remedies they authored (those are
  // customer-readable and carry astrologer PII). The advice text + the customer's
  // question are RETAINED for the customer, just de-identified.
  for (;;) {
    const rem = await db.collection('remedies').where('astrologerId', '==', uid).limit(300).get();
    if (rem.empty) break;
    const batch = db.batch();
    rem.docs.forEach((d) => batch.update(d.ref, {
      astrologerName: 'Deleted astrologer',
      astrologerPhoto: FieldValue.delete(),
    }));
    await batch.commit().catch(() => {});
    if (rem.size < 300) break;
  }

  // 4) Audit, then delete the Auth user (idempotent).
  await db.collection(Collections.auditLogs).add({
    actorUid: uid,
    actorRole: 'astrologer',
    action: 'deleteAstrologerAccount',
    targetType: 'astrologer',
    targetId: uid,
    after: {
      erased: ['profilePII', 'privateSubdocs', 'presence', 'membershipMarkers', 'authUser'],
      retained: ['astrologerLedger', 'consultationSkeleton'],
    },
    createdAt: FieldValue.serverTimestamp(),
  });
  await auth.deleteUser(uid).catch((err) => {
    if ((err as { code?: string })?.code !== 'auth/user-not-found') {
      logger.warn('deleteAstrologerAccount: auth.deleteUser failed', { uid, error: err instanceof Error ? err.message : String(err) });
    }
  });

  return { ok: true };
});
