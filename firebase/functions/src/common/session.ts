/**
 * Session freshness for privileged callables.
 *
 * Callable functions receive an already-decoded ID token but do NOT check
 * revocation — so a token minted before an admin was demoted/removed (or an
 * astrologer suspended) would keep working until it naturally expires (up to an
 * hour). `revokeRefreshTokens(uid)` stamps `tokensValidAfterTime`; calling
 * `assertTokenNotRevoked` on the sensitive callables rejects any token issued
 * before that stamp, giving revocation immediate teeth on the paths that matter.
 */
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { auth } from './admin';

export async function assertTokenNotRevoked(req: CallableRequest): Promise<void> {
  const uid = req.auth?.uid;
  const authTimeSec = req.auth?.token?.auth_time as number | undefined;
  if (!uid || !authTimeSec) {
    throw new HttpsError('unauthenticated', 'Please sign in again.');
  }
  const user = await auth.getUser(uid);
  const validAfterSec = user.tokensValidAfterTime
    ? Math.floor(new Date(user.tokensValidAfterTime).getTime() / 1000)
    : 0;
  // A 5s skew guard: revokeRefreshTokens' stamp can be a hair ahead of the token
  // it's meant to keep valid at the exact moment of issue.
  if (authTimeSec + 5 < validAfterSec) {
    throw new HttpsError('unauthenticated', 'Your session is no longer valid — please sign in again.');
  }
  if (user.disabled) {
    throw new HttpsError('permission-denied', 'This account has been disabled.');
  }
}
