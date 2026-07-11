/**
 * Portal error tracking (B2). The Next.js admin portal has no crash reporting
 * of its own — this callable is its sink. The portal's error boundary and
 * global handlers call `reportClientError` on any uncaught error; we record it
 * as an `alerts` doc, which the deliverAlert trigger then forwards to Slack.
 *
 * Deliberately `warning` severity (not critical) so a portal glitch pings the
 * channel without the @channel blast reserved for money failures. Lightly
 * throttled per (uid, message) so a render loop can't spam the channel.
 */
import { onCall } from 'firebase-functions/v2/https';
import { assertRole } from '../common/errors';
import { db } from '../common/admin';
import { FieldValue } from 'firebase-admin/firestore';

// In-instance throttle: the same admin + same error message is recorded at most
// once per window, so a component that throws on every render sends one alert,
// not hundreds.
const WINDOW_MS = 10 * 60_000;
const lastSeen = new Map<string, number>();

export const reportClientError = onCall(async (req) => {
  const uid = assertRole(req, 'admin'); // only signed-in admins' portals report

  const d = (req.data ?? {}) as {
    message?: string; stack?: string; url?: string; kind?: string;
  };
  const message = String(d.message ?? 'Unknown portal error').slice(0, 300);
  const url = d.url ? String(d.url).slice(0, 200) : '';

  const key = `${uid}:${message}`;
  const now = Date.now();
  const prev = lastSeen.get(key);
  if (prev && now - prev < WINDOW_MS) return { ok: true, throttled: true };
  lastSeen.set(key, now);

  await db.collection('alerts').add({
    kind: 'portal_error',
    severity: 'warning',
    message: `Admin portal error: ${message}${url ? `  ·  ${url}` : ''}`,
    refId: uid,
    stack: d.stack ? String(d.stack).slice(0, 2000) : null,
    resolved: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});
