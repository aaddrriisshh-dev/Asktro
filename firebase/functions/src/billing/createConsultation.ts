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
import { enforceRateLimit } from '../common/rateLimit';
import { canStartConsultation } from '../billing/engine';
import { pricePerSecond } from '../common/money';
import { ConsultationType } from '../common/types';
import { assertNotBlocked } from '../moderation/moderation';
import { assertUnderChatCap } from './chatCap';
import { randomUUID } from 'crypto';

const VALID_TYPES: ConsultationType[] = ['chat', 'voice', 'video'];

export const createConsultation = onCall(async (req) => {
  const customerId = assertAuthed(req);
  await enforceRateLimit('createConsultation', customerId);
  const { astrologerId, type, requestedSkill } = (req.data ?? {}) as {
    astrologerId?: string;
    type?: ConsultationType;
    requestedSkill?: string;
  };

  if (!astrologerId) badRequest('astrologerId is required.');
  if (!type || !VALID_TYPES.includes(type)) badRequest('type must be chat, voice, or video.');

  // The skill the user entered via (home "Browse by skill"), whitelisted to a
  // known set. It drives the AI session's discipline: 'palmistry' opens palm-led;
  // 'numerology' / 'tarot' / 'vastu' make the AI run THAT discipline for this
  // session even if the astrologer's default is Vedic (see replyEngine). 'Vedic'
  // (the default tile) carries no override, so it maps to null. Anything unknown
  // is dropped rather than trusted.
  const SKILLS: Record<string, string> = {
    palmistry: 'palmistry', numerology: 'numerology', tarot: 'tarot', vastu: 'vastu',
  };
  const rawSkill = typeof requestedSkill === 'string' ? requestedSkill.toLowerCase().trim() : '';
  const skill = SKILLS[rawSkill] ?? null;

  const config = await getGlobalConfig();

  // Block gate: if either party has blocked the other, no new session forms.
  await assertNotBlocked(customerId, astrologerId!);

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

  const financialsRef = astrologerRef.collection('private').doc('financials');
  // Per-customer serialization lock. Firestore transactions do NOT detect
  // phantom inserts from a query, so the "no open session" query below cannot,
  // by itself, stop two concurrent createConsultation calls from both reading
  // empty and both creating a session. Having every call READ and WRITE this one
  // per-customer doc forces the two transactions to conflict — the loser retries,
  // re-runs the open-session query against the winner's committed write, and is
  // correctly rejected. Source of truth stays the query; the lock only serializes.
  const lockRef = db.collection('consultationLocks').doc(customerId);

  await db.runTransaction(async (tx) => {
    const [customerSnap, astrologerSnap, financialsSnap] = await Promise.all([
      tx.get(customerRef),
      tx.get(astrologerRef),
      tx.get(financialsRef),
      tx.get(lockRef), // enroll the lock in the conflict set
    ]);

    if (!customerSnap.exists) notFound('Customer profile not found.');
    if (!astrologerSnap.exists) notFound('Astrologer not found.');

    const customer = customerSnap.data()!;
    const astrologer = astrologerSnap.data()!;
    // commissionPercent now lives in private/financials, off the public doc.
    const financials = financialsSnap.data() ?? {};

    if (customer.accountStatus === 'blocked') {
      throw new HttpsError('permission-denied', 'Your account is blocked.');
    }
    if (astrologer.accountStatus !== 'approved') {
      failedPrecondition('This astrologer is not available.');
    }
    // AI personas have no presence heartbeat — they're always online.
    if (astrologer.isAI !== true && astrologer.onlineStatus !== true) {
      failedPrecondition('This astrologer is offline.');
    }
    // Concurrency model for human astrologers:
    //   - CHATS are unlimited & concurrent — an astrologer can run many at once.
    //   - VOICE/VIDEO calls are EXCLUSIVE — one at a time, and no chats during a
    //     call (you can't talk to two people at once).
    // `available === false` means "on or awaiting a call" (the exclusive lock);
    // chats never touch it. AI personas are never gated.
    const isCall = type === 'voice' || type === 'video';
    if (astrologer.isAI === true && isCall) {
      failedPrecondition('This astrologer is chat-only.');
    }
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
      } else {
        // Fairness cap: a human astrologer may hold only so many LIVE chats at
        // once (default 5, tunable via config without a deploy). Beyond that a
        // new customer would just sit in a queue while the meter never starts —
        // so we refuse up front and steer them to another reader. Counts only
        // active/paused chats (the ones actually running); 0/missing disables it.
        await assertUnderChatCap(tx, astrologerId!, config.maxConcurrentChatsPerAstrologer ?? 0);
      }
    }

    // Per-astrologer, PER-TYPE rate, snapshotted onto the session below so a
    // later admin change never re-rates an in-progress consultation. Each type
    // (chat/voice/video) has its own rate; each falls back to the astrologer's
    // legacy single `ratePerMinutePaise`, then to the global base rate (e.g. AI
    // personas or astrologers onboarded before per-type pricing).
    const typeRateField =
      type === 'voice' ? 'voiceRatePaise' : type === 'video' ? 'videoRatePaise' : 'chatRatePaise';
    const typeRate = astrologer[typeRateField] as number | undefined;
    const legacyRate = astrologer.ratePerMinutePaise as number | undefined;
    const rawPrice =
      typeof typeRate === 'number' && typeRate > 0
        ? typeRate
        : typeof legacyRate === 'number' && legacyRate > 0
          ? legacyRate
          : config.consultationPricePerMinutePaise;
    // Clamp against a server-config ceiling so a corrupted/absurd astrologer rate
    // can never price a session above the sane maximum, and never negative/NaN.
    const maxRate = config.maxConsultationPricePerMinutePaise ?? 50000;
    const price = Number.isFinite(rawPrice) && rawPrice > 0 ? Math.min(rawPrice, maxRate) : config.consultationPricePerMinutePaise;

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
    // above). Read from private/financials; falls back to the global config when
    // the astrologer has none set.
    const commissionPercent =
      typeof financials.commissionPercent === 'number'
        ? financials.commissionPercent
        : config.commissionPercent;
    const agoraChannel = type === 'chat' ? null : `asktro_${consultationRef.id}_${randomUUID().slice(0, 8)}`;

    tx.set(consultationRef, {
      customerId,
      astrologerId,
      isAI: astrologer.isAI === true,
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
      ...(skill ? { requestedSkill: skill } : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Write the per-customer lock so two concurrent creates conflict (the loser's
    // read of this doc is invalidated → it retries → sees this new session).
    tx.set(lockRef, { lastConsultationId: consultationRef.id, updatedAt: FieldValue.serverTimestamp() });

    // Reserve the astrologer ONLY for a call (the exclusive lock). Chats never
    // reserve — many can run at once. AI personas are never reserved.
    if (astrologer.isAI !== true && isCall) {
      tx.update(astrologerRef, { available: false, updatedAt: FieldValue.serverTimestamp() });
    }

    // Mirror a SAFE customer card (name, photo, birth details ONLY — never
    // phone/email/money) so astrologers can render the client for a reading
    // without ever reading the real `users` doc. Refreshed on each new session.
    tx.set(
      db.collection('customerProfiles').doc(customerId),
      {
        name: customer.name ?? '',
        profilePhoto: customer.profilePhoto ?? null,
        gender: customer.gender ?? null,
        birthDateMs: customer.birthDateMs ?? null,
        birthTime: customer.birthTime ?? null,
        birthTimeKnown: customer.birthTimeKnown ?? true,
        birthPlace: customer.birthPlace ?? null,
        languages: customer.languages ?? [],
        relationshipStatus: customer.relationshipStatus ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // Membership marker: this astrologer has consulted this customer, so the
    // security rules let them read ONLY this customer's safe card (never the
    // whole collection). Prevents any astrologer from enumerating all customers.
    tx.set(
      db.collection('astrologerCustomers').doc(astrologerId!).collection('customers').doc(customerId),
      { firstConsultedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

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
