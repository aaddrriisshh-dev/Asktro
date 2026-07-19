/**
 * Admin-team management (super-admin only).
 *
 * Three tiers, stored as the `adminRole` custom claim + an `adminUsers/{uid}`
 * profile doc (so the portal can list the team and resolve uid → name for the
 * "added by / approved by" attribution shown across the console):
 *   - super     → full access (Adrish, Vineet, Sanjay)
 *   - ops       → Chief Operations Admin (everything except top-line money)
 *   - astrology → Chief Astrology Admin (only astrologer things)
 *
 * Only a super-admin can create admins or change roles.
 */
import { onCall } from 'firebase-functions/v2/https';
import { auth, db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { assertRole, badRequest, failedPrecondition, HttpsError } from '../common/errors';
import { assertTokenNotRevoked } from '../common/session';

export const ADMIN_ROLES = ['super', 'ops', 'astrology'] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

function tempPassword(): string {
  const s = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = 'Adm-';
  for (let i = 0; i < 10; i++) out += s[Math.floor(Math.random() * s.length)];
  return out;
}

async function requireSuper(req: Parameters<Parameters<typeof onCall>[0]>[0]): Promise<string> {
  const actor = assertRole(req, 'admin');
  if (req.auth?.token?.adminRole !== 'super') failedPrecondition('Only a super-admin can manage the admin team.');
  // Admin-team management grants/revokes privilege — reject a revoked session.
  await assertTokenNotRevoked(req);
  return actor;
}

/** Look up the acting admin's display name (for audit attribution). */
async function actorName(uid: string): Promise<string> {
  const d = await db.collection(Collections.adminUsers).doc(uid).get();
  return (d.data()?.name as string | undefined) ?? '';
}

/** Create an admin: Auth account (or reuse an existing email) + role claim + profile. */
export const createAdmin = onCall(async (req) => {
  const actor = await requireSuper(req);
  const { name, email, adminRole, password } = (req.data ?? {}) as {
    name?: string; email?: string; adminRole?: AdminRole; password?: string;
  };
  if (!name || !email || !adminRole) badRequest('name, email and adminRole are required.');
  if (!ADMIN_ROLES.includes(adminRole!)) badRequest('adminRole must be super, ops or astrology.');

  let uid: string;
  let tempPw: string | null = null;
  try {
    const existing = await auth.getUserByEmail(email!.trim());
    uid = existing.uid;
  } catch {
    const pw = password && password.length >= 6 ? password : tempPassword();
    try {
      const created = await auth.createUser({ email: email!.trim(), password: pw, displayName: name!.trim() });
      uid = created.uid;
      tempPw = password ? null : pw;
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'auth/email-already-exists') failedPrecondition('An account with this email already exists.');
      throw new HttpsError('internal', (e as { message?: string })?.message ?? 'Could not create the account.');
    }
  }

  await auth.setCustomUserClaims(uid, { role: 'admin', adminRole });
  await db.collection(Collections.adminUsers).doc(uid).set(
    {
      name: name!.trim(),
      email: email!.trim(),
      adminRole,
      createdBy: actor,
      createdByName: await actorName(actor),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await db.collection(Collections.auditLogs).add({
    actorUid: actor, actorRole: 'admin', actorName: await actorName(actor),
    action: 'createAdmin', targetType: 'admin', targetId: uid,
    after: { email, adminRole }, createdAt: FieldValue.serverTimestamp(),
  });

  return { uid, email, tempPassword: tempPw };
});

/** Change an existing admin's role (super-only). */
export const setAdminRole = onCall(async (req) => {
  const actor = await requireSuper(req);
  const { targetUid, adminRole } = (req.data ?? {}) as { targetUid?: string; adminRole?: AdminRole };
  if (!targetUid || !adminRole) badRequest('targetUid and adminRole are required.');
  if (!ADMIN_ROLES.includes(adminRole!)) badRequest('adminRole must be super, ops or astrology.');

  await auth.setCustomUserClaims(targetUid!, { role: 'admin', adminRole });
  // Invalidate existing sessions so the new (possibly lower) tier takes effect
  // immediately instead of after the old ID token expires.
  await auth.revokeRefreshTokens(targetUid!);
  await db.collection(Collections.adminUsers).doc(targetUid!).set(
    { adminRole, updatedAt: FieldValue.serverTimestamp() }, { merge: true },
  );
  await db.collection(Collections.auditLogs).add({
    actorUid: actor, actorRole: 'admin', actorName: await actorName(actor),
    action: 'setAdminRole', targetType: 'admin', targetId: targetUid,
    after: { adminRole }, createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

/** Revoke an admin: disable the login and remove their admin profile + claims. */
export const removeAdmin = onCall(async (req) => {
  const actor = await requireSuper(req);
  const { targetUid } = (req.data ?? {}) as { targetUid?: string };
  if (!targetUid) badRequest('targetUid is required.');
  if (targetUid === actor) failedPrecondition('You cannot remove your own admin access.');

  try { await auth.setCustomUserClaims(targetUid!, {}); } catch { /* claims may already be clear */ }
  try { await auth.updateUser(targetUid!, { disabled: true }); } catch { /* auth user may be gone */ }
  // Kill any live session immediately (disable alone lets an unexpired ID token
  // keep calling until it lapses).
  try { await auth.revokeRefreshTokens(targetUid!); } catch { /* auth user may be gone */ }
  await db.collection(Collections.adminUsers).doc(targetUid!).set(
    { adminRole: 'revoked', disabled: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true },
  );
  await db.collection(Collections.auditLogs).add({
    actorUid: actor, actorRole: 'admin', actorName: await actorName(actor),
    action: 'removeAdmin', targetType: 'admin', targetId: targetUid, createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

/** List the admin team (any admin can read, for attribution & the roster). */
export const listAdmins = onCall(async (req) => {
  assertRole(req, 'admin');
  const snap = await db.collection(Collections.adminUsers).get();
  const admins = snap.docs
    .map((d) => {
      const a = d.data();
      return {
        uid: d.id,
        name: (a.name as string) ?? '',
        email: (a.email as string) ?? '',
        adminRole: (a.adminRole as string) ?? 'ops',
        disabled: a.disabled === true,
      };
    })
    .filter((a) => a.adminRole !== 'revoked');
  return { admins };
});
