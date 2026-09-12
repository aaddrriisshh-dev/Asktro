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

const MAX_TTL_SEC = 3600; // hard ceiling for any token (1 hour)
// Backstop against Agora minutes accruing past the paid balance if a client fails
// to leave the channel on exhaustion (the app already leaves on pause; this guards
// a crashed/misbehaving/hostile client). The CUSTOMER's token is issued to last
// only as long as they can afford + a generous buffer, so a stuck channel drops
// itself shortly after the balance would run out. It NEVER cuts a legitimate call:
// the app ends the call at the pause instant (≤ affordable), well before this, and
// a network reconnect re-mints a fresh token. The astrologer (unbilled) keeps the
// full ceiling. Calls have no mid-call resume, so affordability is fixed at join.
const TTL_BUFFER_SEC = 300; // 5-min cushion over affordable time (covers reconnects/settle)
const MIN_TTL_SEC = 120;    // floor so a low-balance call still connects cleanly

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

    // The astrologer (unbilled) gets the full ceiling. The customer's token lasts
    // only as long as their balance can pay for + a buffer — a stuck channel then
    // drops itself instead of billing Agora past ₹0. Over-provision spendable (sum
    // every bucket) and add a wide buffer so a paying customer is never cut short.
    let ttlSec = MAX_TTL_SEC;
    if (uid === c.customerId) {
      const ratePerMin = Number(c.pricePerMinute) || 0;
      if (ratePerMin > 0) {
        const uSnap = await db.collection(Collections.users).doc(c.customerId).get();
        const u = uSnap.data() ?? {};
        const spendablePaise = (Number(u.walletBalance) || 0) + (Number(u.bonusBalance) || 0) + (Number(u.chatBonusBalance) || 0);
        const affordableSec = Math.ceil((spendablePaise / ratePerMin) * 60);
        ttlSec = Math.min(MAX_TTL_SEC, Math.max(MIN_TTL_SEC, affordableSec + TTL_BUFFER_SEC));
      }
      // ratePerMin === 0 (misconfig) → leave ttlSec at the ceiling; never cut a call.
    }

    const privilegeExpire = Math.floor(Timestamp.now().toMillis() / 1000) + ttlSec;

    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID.value(),
      AGORA_APP_CERTIFICATE.value(),
      c.agoraChannel,
      numericUid,
      RtcRole.PUBLISHER,
      ttlSec,
      privilegeExpire,
    );

    return {
      token,
      appId: AGORA_APP_ID.value(),
      channel: c.agoraChannel,
      uid: numericUid,
      expiresInSec: ttlSec,
    };
  },
);
