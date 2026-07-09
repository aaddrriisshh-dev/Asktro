/**
 * createConsultation — atomically validates and creates a consultation session
 * in `waiting`. Enforces: customer active, astrologer approved+online+available,
 * minimum wallet, no existing open session, feature flags. Never trusts client
 * for price. See docs/BILLING_ENGINE.md.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { getGlobalConfig } from '../common/config';
import { assertAuthed, badRequest, failedPrecondition, notFound } from '../common/errors';
import { canStartConsultation } from '../billing/engine';
import { pricePerSecond } from '../common/money';
import { ConsultationType } from '../common/types';
import { randomUUID } from 'crypto';

const VALID_TYPES: ConsultationType[] = ['chat', 'voice', 'video'];

export const createConsultation = onCall(async (req) => {
  const customerId = assertAuthed(req);
  const { astrologerId, type } = (req.data ?? {}) as {
    astrologerId?: string;
    type?: ConsultationType;
  };

  if (!astrologerId) badRequest('astrologerId is required.');
  if (!type || !VALID_TYPES.includes(type)) badRequest('type must be chat, voice, or video.');

  const config = await getGlobalConfig();

  // Feature-flag gating for voice/video.
  if (type === 'voice' && config.featureFlags.voice === false) {
    failedPrecondition('Voice consultations are temporarily unavailable.');
  }
  if (type === 'video' && config.featureFlags.video === false) {
    failedPrecondition('Video consultations are temporarily unavailable.');
  }

  const consultationRef = db.collection(Collections.consultations).doc();
  const customerRef = db.collection(Collections.users).doc(customerId);
  const astrologerRef = db.collection(Collections.astrologers).doc(astrologerId!);

  await db.runTransaction(async (tx) => {
    const [customerSnap, astrologerSnap] = await Promise.all([
      tx.get(customerRef),
      tx.get(astrologerRef),
    ]);

    if (!customerSnap.exists) notFound('Customer profile not found.');
    if (!astrologerSnap.exists) notFound('Astrologer not found.');

    const customer = customerSnap.data()!;
    const astrologer = astrologerSnap.data()!;

    if (customer.accountStatus === 'blocked') {
      throw new HttpsError('permission-denied', 'Your account is blocked.');
    }
    if (astrologer.accountStatus !== 'approved') {
      failedPrecondition('This astrologer is not available.');
    }
    if (astrologer.onlineStatus !== true) {
      failedPrecondition('This astrologer is offline.');
    }
    // Concurrency model for human astrologers:
    //   - CHATS are unlimited & concurrent — an astrologer can run many at once.
    //   - VOICE/VIDEO calls are EXCLUSIVE — one at a time, and no chats during a
    //     call (you can't talk to two people at once).
    // `available === false` means "on or awaiting a call" (the exclusive lock);
    // chats never touch it. AI personas are never gated.
    const isCall = type === 'voice' || type === 'video';
    if (astrologer.isAI !== true) {
      // A call in progress (or awaiting accept) blocks everything, chat or call.
      if (astrologer.available !== true) {
        failedPrecondition('This astrologer is on a call right now. Please try again shortly.');
      }
      if (isCall) {
        // Starting a call needs the astrologer fully free — no open chats either.
        const openSnap = await tx.get(
          db
            .collection(Collections.consultations)
            .where('astrologerId', '==', astrologerId!)
            .where('status', 'in', ['waiting', 'active', 'paused'])
            .limit(20),
        );
        if (openSnap.docs.some((d) => d.data().type === 'chat')) {
          failedPrecondition('This astrologer is busy in chats right now. Please try again shortly.');
        }
      }
    }

    // Per-astrologer rate, snapshotted onto the session below so a later admin
    // change never re-rates an in-progress consultation. Falls back to the
    // global base rate only when an astrologer has none set (e.g. AI personas).
    const price =
      typeof astrologer.ratePerMinutePaise === 'number' && astrologer.ratePerMinutePaise > 0
        ? astrologer.ratePerMinutePaise
        : config.consultationPricePerMinutePaise;

    // The one-time free CHAT credit (chatBonusBalance) is usable ONLY with AI or
    // base-rate astrologers. Premium human astrologers charge from the first
    // second, so their chats never draw on it. Decided once here and stamped on
    // the session so every downstream tick honours the same rule.
    const chatCreditEligible = type === 'chat'
        && (astrologer.isAI === true || price <= config.consultationPricePerMinutePaise);

    const spendable = (customer.walletBalance ?? 0) +
        (customer.bonusBalance ?? 0) +
        (chatCreditEligible ? (customer.chatBonusBalance ?? 0) : 0);
    if (!canStartConsultation(spendable, config.minWalletToStartPaise)) {
      throw new HttpsError(
        'failed-precondition',
        'INSUFFICIENT_BALANCE',
        { minWalletToStartPaise: config.minWalletToStartPaise, spendable },
      );
    }

    // No concurrent open session for this customer.
    const openSnap = await tx.get(
      db
        .collection(Collections.consultations)
        .where('customerId', '==', customerId)
        .where('status', 'in', ['waiting', 'active', 'paused'])
        .limit(1),
    );
    if (!openSnap.empty) {
      failedPrecondition('You already have an active consultation.');
    }

    // Per-astrologer commission, snapshotted onto the session (price computed
    // above). Falls back to the global config when the astrologer has none set.
    const commissionPercent =
      typeof astrologer.commissionPercent === 'number'
        ? astrologer.commissionPercent
        : config.commissionPercent;
    const agoraChannel = type === 'chat' ? null : `asktro_${consultationRef.id}_${randomUUID().slice(0, 8)}`;

    tx.set(consultationRef, {
      customerId,
      astrologerId,
      type,
      pricePerMinute: price,
      pricePerSecond: pricePerSecond(price),
      commissionPercent,
      chatCreditEligible,
      status: 'waiting',
      paymentStatus: 'pending',
      networkStatus: 'ok',
      startTime: null,
      endTime: null,
      lastTickAt: null,
      billedSeconds: 0,
      duration: 0,
      walletBefore: spendable,
      walletAfter: spendable,
      totalCharged: 0,
      pausedAccumMs: 0,
      pausedAt: null,
      warnLevel: 0,
      remainingSec: 0,
      agoraChannel,
      rating: null,
      review: null,
      receiptNo: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Reserve the astrologer ONLY for a call (the exclusive lock). Chats never
    // reserve — many can run at once. AI personas are never reserved.
    if (astrologer.isAI !== true && isCall) {
      tx.update(astrologerRef, { available: false, updatedAt: FieldValue.serverTimestamp() });
    }

    // Notify the astrologer of the incoming request.
    const notifRef = db.collection(Collections.notifications).doc();
    tx.set(notifRef, {
      userId: astrologerId,
      title: 'New consultation request',
      body: `Incoming ${type} consultation.`,
      type: 'consultation_request',
      deeplink: `asktro://consultation/${consultationRef.id}`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { consultationId: consultationRef.id };
});
