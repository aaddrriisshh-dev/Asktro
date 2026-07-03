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

function tempPassword(): string {
  const s = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = 'Ast-';
  for (let i = 0; i < 10; i++) out += s[Math.floor(Math.random() * s.length)];
  return out;
}

function requireOpsOrSuper(req: Parameters<Parameters<typeof onCall>[0]>[0]): string {
  const actor = assertRole(req, 'admin');
  const role = req.auth?.token?.adminRole;
  if (role !== 'super' && role !== 'ops') failedPrecondition('Requires ops or super admin.');
  return actor;
}

/** Create an astrologer: Auth account + role claim + profile at astrologers/{uid}. */
export const createAstrologer = onCall(async (req) => {
  const actor = requireOpsOrSuper(req);

  const d = (req.data ?? {}) as {
    name?: string; email?: string; phone?: string; password?: string;
    experience?: number; languages?: string[]; expertise?: string[];
    about?: string; ratePerMinutePaise?: number;
  };
  if (!d.name || !d.email) badRequest('name and email are required.');

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

  await db.collection(Collections.astrologers).doc(uid).set(
    {
      name: d.name!.trim(),
      email: d.email!.trim(),
      phone: d.phone ?? null,
      about: d.about ?? '',
      experience: d.experience ?? 0,
      languages: d.languages ?? [],
      expertise: d.expertise ?? [],
      ...(typeof d.ratePerMinutePaise === 'number' ? { ratePerMinutePaise: d.ratePerMinutePaise } : {}),
      rating: 0,
      totalReviews: 0,
      totalConsultations: 0,
      earnings: 0,
      pendingPayout: 0,
      onlineStatus: false,
      available: false,
      verified: true,
      featured: false,
      accountStatus: 'approved',
      createdAt: FieldValue.serverTimestamp(),
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

  const allowed = ['name', 'phone', 'about', 'experience', 'languages', 'expertise', 'ratePerMinutePaise', 'featured'];
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  for (const k of allowed) if (k in rest) patch[k] = rest[k];

  await db.collection(Collections.astrologers).doc(astrologerId!).set(patch, { merge: true });
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
