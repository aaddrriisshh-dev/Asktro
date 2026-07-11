/**
 * generateAgoraToken — mints a short-lived Agora RTC token for a voice/video
 * consultation. The App Certificate never ships to clients. Only a participant
 * of an active/waiting session may request a token for its channel.
 */
import { onCall } from 'firebase-functions/v2/https';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { db, Timestamp } from '../common/admin';
import { Collections } from '../common/collections';
import { assertAuthed, badRequest, failedPrecondition, notFound } from '../common/errors';
import { AGORA_APP_ID, AGORA_APP_CERTIFICATE } from '../common/secrets';

const TOKEN_TTL_SEC = 3600; // 1 hour; clients renew via this function

export const generateAgoraToken = onCall(
  { secrets: [AGORA_APP_ID, AGORA_APP_CERTIFICATE] },
  async (req) => {
    const uid = assertAuthed(req);
    const { consultationId } = (req.data ?? {}) as {
      consultationId?: string;
    };
    if (!consultationId) badRequest('consultationId is required.');

    const snap = await db.collection(Collections.consultations).doc(consultationId!).get();
    if (!snap.exists) notFound('Consultation not found.');
    const c = snap.data()!;

    if (uid !== c.customerId && uid !== c.astrologerId) {
      failedPrecondition('Not a participant of this consultation.');
    }
    if (!c.agoraChannel) failedPrecondition('This consultation has no voice/video channel.');
    if (!['waiting', 'active', 'paused'].includes(c.status)) {
      failedPrecondition('This consultation is not joinable.');
    }

    // Derive the Agora uid from the caller's ROLE in this call — customer=1,
    // astrologer=2 — so the two participants always get DISTINCT uids. Never
    // trust a client-supplied uid: if both omit it (or send the same), Agora
    // treats them as one user (uid 0) and one kicks the other, so calls silently
    // fail to connect. A call has exactly these two human parties (AI never calls).
    const numericUid = uid === c.customerId ? 1 : 2;
    const privilegeExpire = Math.floor(Timestamp.now().toMillis() / 1000) + TOKEN_TTL_SEC;

    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID.value(),
      AGORA_APP_CERTIFICATE.value(),
      c.agoraChannel,
      numericUid,
      RtcRole.PUBLISHER,
      TOKEN_TTL_SEC,
      privilegeExpire,
    );

    return {
      token,
      appId: AGORA_APP_ID.value(),
      channel: c.agoraChannel,
      uid: numericUid,
      expiresInSec: TOKEN_TTL_SEC,
    };
  },
);
