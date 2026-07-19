/** Thin helpers around HttpsError + auth/role assertions for callables. */
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

export function assertAuthed(req: CallableRequest): string {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return uid;
}

export function assertRole(req: CallableRequest, role: 'astrologer' | 'admin'): string {
  const uid = assertAuthed(req);
  if (req.auth?.token?.role !== role) {
    throw new HttpsError('permission-denied', `Requires ${role} role.`);
  }
  return uid;
}

export type AdminTier = 'super' | 'ops' | 'astrology';

/** Assert the caller is an admin whose tier is one of `tiers`. Use this for any
 *  privileged admin action so a lower tier can't reach a money/privilege path
 *  just by being *some* admin (e.g. broadcast, user status, ops resolve are
 *  super/ops; money mints are super). */
export function assertAdminTier(req: CallableRequest, tiers: AdminTier[]): string {
  const uid = assertRole(req, 'admin');
  const tier = req.auth?.token?.adminRole as AdminTier | undefined;
  if (!tier || !tiers.includes(tier)) {
    throw new HttpsError('permission-denied', `Requires admin tier: ${tiers.join(' or ')}.`);
  }
  return uid;
}

/** True when the caller is a super admin. */
export function isSuperAdmin(req: CallableRequest): boolean {
  return req.auth?.token?.role === 'admin' && req.auth?.token?.adminRole === 'super';
}

export function badRequest(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

export function failedPrecondition(message: string): never {
  throw new HttpsError('failed-precondition', message);
}

export function notFound(message: string): never {
  throw new HttpsError('not-found', message);
}

export { HttpsError };
