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
