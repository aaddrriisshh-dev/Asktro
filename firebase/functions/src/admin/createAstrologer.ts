/**
 * Astrologer provisioning (admin-only).
 *
 * The astrologer app resolves "self" by `astrologers/{uid}` (doc id == Firebase
 * Auth uid), and bookings reserve `astrologers/{id}`. So an astrologer MUST have
 * an Auth account whose uid is the profile doc id. These functions create that
 * account, grant the `astrologer` role claim, and write the profile at that uid
 * — closing the gap where the old "add astrologer" wrote a random-id doc with no
 * login (which could never receive bookings or sign in).
 */
import { onCall } from 'firebase-functions/v2/https';
import { auth, db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { assertRole, badRequest, failedPrecondition, HttpsError } from '../common/errors';
import { adminName } from '../common/actor';

function tempPassword(): string {
  const s = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = 'Ast-';
  for (let i = 0; i < 10; i++) out += s[Math.floor(Math.random() * s.length)];
  return out;
}

function requireOpsOrSuper(req: Parameters<Parameters<typeof onCall>[0]>[0]): string {
  const actor = assertRole(req, 'admin');
  const role = req.auth?.token?.adminRole;
  // Ops, Astrology and Super can all onboard astrologers; only Super approves.
  if (role !== 'super' && role !== 'ops' && role !== 'astrology') failedPrecondition('Requires an admin role.');
  return actor;
}

// Money / trust fields: only a Super Admin may set an astrologer's commission,
// per-minute rates or AI flag. Ops/Astrology can onboard & edit the profile, but
// these value-minting fields are stripped from their payload server-side (Super
// sets them at approval). Mirrors the super-only writes in firestore.rules.
const PRIVILEGED_ASTRO_FIELDS = [
  'commissionPercent', 'ratePerMinutePaise', 'chatRatePaise', 'voiceRatePaise', 'videoRatePaise', 'isAI',
] as const;

function stripPrivilegedForNonSuper<T extends Record<string, unknown>>(
  req: Parameters<Parameters<typeof onCall>[0]>[0],
  data: T,
): { stripped: string[] } {
  if (req.auth?.token?.adminRole === 'super') return { stripped: [] };
  const stripped: string[] = [];
  for (const k of PRIVILEGED_ASTRO_FIELDS) {
    if (k in data && data[k] !== undefined) {
      delete data[k];
      stripped.push(k);
    }
  }
  return { stripped };
}

/** Create an astrologer: Auth account + role claim + profile at astrologers/{uid}. */
export const createAstrologer = onCall(async (req) => {
  const actor = requireOpsOrSuper(req);

  const d = (req.data ?? {}) as {
    name?: string; email?: string; phone?: string; password?: string;
    experience?: number; languages?: string[]; expertise?: string[];
    about?: string; ratePerMinutePaise?: number; commissionPercent?: number;
    chatRatePaise?: number; voiceRatePaise?: number; videoRatePaise?: number;
    profilePhoto?: string; isAI?: boolean; risingStar?: boolean;
    age?: number; gender?: string;
  };
  if (!d.name || !d.email) badRequest('name and email are required.');

  // Non-super admins can't set commission / rates / AI status — strip them.
  stripPrivilegedForNonSuper(req, d);

  const password = d.password && d.password.length >= 6 ? d.password : tempPassword();

  let uid: string;
  try {
    const user = await auth.createUser({
      email: d.email!.trim(),
      password,
      displayName: d.name!.trim(),
      ...(d.phone && d.phone.startsWith('+') ? { phoneNumber: d.phone.trim() } : {}),
    });
    uid = user.uid;
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === 'auth/email-already-exists') failedPrecondition('An account with this email already exists.');
    if (code === 'auth/phone-number-already-exists') failedPrecondition('An account with this phone already exists.');
    if (code === 'auth/invalid-phone-number') badRequest('Phone must be E.164, e.g. +919999999999.');
    throw new HttpsError('internal', (e as { message?: string })?.message ?? 'Could not create the account.');
  }

  await auth.setCustomUserClaims(uid, { role: 'astrologer' });

  // Only a Super Admin's additions go live immediately; anyone else's wait in
  // "pending" for a super to approve. Either way we record who added them.
  const isSuper = req.auth?.token?.adminRole === 'super';
  const actorNm = await adminName(actor);

  await db.collection(Collections.astrologers).doc(uid).set(
    {
      name: d.name!.trim(),
      about: d.about ?? '',
      experience: d.experience ?? 0,
      languages: d.languages ?? [],
      expertise: d.expertise ?? [],
      ...(typeof d.ratePerMinutePaise === 'number' ? { ratePerMinutePaise: d.ratePerMinutePaise } : {}),
      // Per-type rates (chat/voice/video). Each falls back to ratePerMinutePaise
      // at billing time if unset, so older astrologers keep working.
      ...(typeof d.chatRatePaise === 'number' ? { chatRatePaise: d.chatRatePaise } : {}),
      ...(typeof d.voiceRatePaise === 'number' ? { voiceRatePaise: d.voiceRatePaise } : {}),
      ...(typeof d.videoRatePaise === 'number' ? { videoRatePaise: d.videoRatePaise } : {}),
      // NOTE: commissionPercent, earnings and pendingPayout are NOT on the public
      // directory doc — they live in private/financials (below), readable only by
      // the astrologer themselves and admins, so no customer/competitor can read
      // another astrologer's commission or lifetime revenue.
      ...(d.profilePhoto ? { profilePhoto: d.profilePhoto } : {}),
      isAI: d.isAI === true,
      risingStar: d.risingStar === true,
      // Persona identity for the AI reply engine: age drives the address terms
      // (beta/bhaiya/Babuji per the client's age gap); gender drives gendered
      // phrasing. Harmless on human astrologers.
      ...(typeof d.age === 'number' && d.age > 0 ? { age: d.age } : {}),
      ...(d.gender === 'male' || d.gender === 'female' ? { gender: d.gender } : {}),
      rating: 0,
      totalReviews: 0,
      totalConsultations: 0,
      onlineStatus: false,
      available: true, // free to consult once they go online (busy flag flips during a session)
      verified: isSuper,
      featured: false,
      accountStatus: isSuper ? 'approved' : 'pending',
      addedBy: actor,
      addedByName: actorNm,
      addedAt: FieldValue.serverTimestamp(),
      ...(isSuper ? { approvedBy: actor, approvedByName: actorNm, approvedAt: FieldValue.serverTimestamp() } : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // Contact PII (email/phone) lives in a private subcollection readable only by
  // the astrologer themselves and admins — never on the public directory doc, so
  // a customer can never read an astrologer's phone or email.
  await db.collection(Collections.astrologers).doc(uid).collection('private').doc('contact').set(
    { email: d.email!.trim(), phone: d.phone ?? null, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  // Money fields live in private/financials — readable only by this astrologer
  // and admins (never on the public directory doc). Commission is a per-astrologer
  // config value; earnings/pendingPayout are lifetime accruals.
  await db.collection(Collections.astrologers).doc(uid).collection('private').doc('financials').set(
    {
      earnings: 0,
      pendingPayout: 0,
      ...(typeof d.commissionPercent === 'number' ? { commissionPercent: d.commissionPercent } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await db.collection(Collections.auditLogs).add({
    actorUid: actor,
    actorRole: 'admin',
    action: 'createAstrologer',
    targetType: 'astrologer',
    targetId: uid,
    after: { email: d.email, name: d.name },
    createdAt: FieldValue.serverTimestamp(),
  });

  // Return the temp password only when we generated it, so the admin can hand
  // the astrologer their first-login credentials.
  return { uid, email: d.email, tempPassword: d.password ? null : password };
});

/** Update an existing astrologer's editable profile fields (admin-only). */
export const updateAstrologer = onCall(async (req) => {
  const actor = requireOpsOrSuper(req);
  const { astrologerId, ...rest } = (req.data ?? {}) as { astrologerId?: string } & Record<string, unknown>;
  if (!astrologerId) badRequest('astrologerId is required.');

  // Non-super admins can't change commission / rates / AI status — strip them so
  // an ops/astrology edit can't mint value or alter billing.
  stripPrivilegedForNonSuper(req, rest);

  const allowed = ['name', 'about', 'experience', 'languages', 'expertise', 'ratePerMinutePaise', 'chatRatePaise', 'voiceRatePaise', 'videoRatePaise', 'profilePhoto', 'isAI', 'featured', 'risingStar', 'age', 'gender'];
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  for (const k of allowed) if (k in rest) patch[k] = rest[k];

  await db.collection(Collections.astrologers).doc(astrologerId!).set(patch, { merge: true });

  // commissionPercent is a money field — keep it in private/financials, never on
  // the public doc. Only write a valid number so a blank edit form can't clobber it.
  if ('commissionPercent' in rest && typeof rest.commissionPercent === 'number' && !Number.isNaN(rest.commissionPercent)) {
    await db.collection(Collections.astrologers).doc(astrologerId!).collection('private').doc('financials').set(
      { commissionPercent: rest.commissionPercent, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }

  // Phone is contact PII — keep it in the private subcollection, never the public
  // doc. Only write a NON-EMPTY phone: an edit form that didn't hydrate the phone
  // field (e.g. opened from the list) sends a blank value, and a blank must never
  // overwrite/erase the astrologer's real stored number.
  if ('phone' in rest && typeof rest.phone === 'string' && rest.phone.trim() !== '') {
    await db.collection(Collections.astrologers).doc(astrologerId!).collection('private').doc('contact').set(
      { phone: rest.phone.trim(), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  await db.collection(Collections.auditLogs).add({
    actorUid: actor, actorRole: 'admin', action: 'updateAstrologer',
    targetType: 'astrologer', targetId: astrologerId, after: patch, createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

/** Soft-remove an astrologer: disable login + mark disabled (history preserved). */
export const deleteAstrologer = onCall(async (req) => {
  const actor = requireOpsOrSuper(req);
  const { astrologerId } = (req.data ?? {}) as { astrologerId?: string };
  if (!astrologerId) badRequest('astrologerId is required.');

  try {
    await auth.updateUser(astrologerId!, { disabled: true });
  } catch {
    // Auth user may not exist for legacy random-id docs — still disable the profile.
  }
  await db.collection(Collections.astrologers).doc(astrologerId!).set(
    { accountStatus: 'disabled', onlineStatus: false, available: false, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  await db.collection(Collections.auditLogs).add({
    actorUid: actor, actorRole: 'admin', action: 'deleteAstrologer',
    targetType: 'astrologer', targetId: astrologerId, createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});
