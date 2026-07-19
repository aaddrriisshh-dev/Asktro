/**
 * resolveOpsItem — mark a Trust-&-Safety / operations item handled. Admin-only.
 * Backs the portal's Moderation & Alerts console: reports, operational alerts,
 * payment dead-letters, and the image-review queue are function-write-only, so
 * an admin "Resolve" click routes through here (which the Admin SDK executes,
 * bypassing the deny-by-default client rules).
 */
import { onCall } from 'firebase-functions/v2/https';
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { assertAdminTier, badRequest } from '../common/errors';

const RESOLVABLE = new Set(['reports', 'alerts', 'failedWebhookCredits', 'imageModeration']);

export const resolveOpsItem = onCall(async (req) => {
  const actor = assertAdminTier(req, ['super', 'ops']);
  const { collection, id } = (req.data ?? {}) as { collection?: string; id?: string };
  if (!collection || !id) badRequest('collection and id are required.');
  if (!RESOLVABLE.has(collection!)) badRequest('Unsupported collection.');

  // reports track `status`; alerts/dead-letters/images track `resolved`.
  const patch: Record<string, unknown> =
    collection === 'reports'
      ? { status: 'resolved', resolvedBy: actor, resolvedAt: FieldValue.serverTimestamp() }
      : { resolved: true, resolvedBy: actor, resolvedAt: FieldValue.serverTimestamp() };

  await db.collection(collection!).doc(id!).set(patch, { merge: true });

  await db.collection(Collections.auditLogs).add({
    actorUid: actor,
    actorRole: 'admin',
    action: 'resolveOpsItem',
    targetType: collection,
    targetId: id,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});
