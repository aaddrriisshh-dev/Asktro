/**
 * tickConsultation — the deduction heartbeat. The active client calls this
 * every ~10s; a scheduled sweep also calls the shared `applyTick` as a safety
 * net. Bills elapsed **server** time at ₹0.15/sec, debiting bonus-first, and
 * pauses the session when the balance is exhausted. Fully transactional and
 * idempotent w.r.t. wall-clock (a late tick simply bills the larger delta,
 * clamped to spendable). See docs/BILLING_ENGINE.md.
 */
import { onCall } from 'firebase-functions/v2/https';
import { Transaction } from 'firebase-admin/firestore';
import { db, FieldValue, Timestamp } from '../common/admin';
import { Collections } from '../common/collections';
import { getGlobalConfig } from '../common/config';
import { assertAuthed, badRequest, failedPrecondition, notFound } from '../common/errors';
import { computeTick, deriveWarnLevel, MAX_TICK_ELAPSED_MS } from './engine';
import { affordableSeconds } from '../common/money';
import { writeLedger } from '../wallet/ledger';
import { GlobalConfig, NetworkStatus } from '../common/types';

export interface TickOutcome {
  status: 'active' | 'paused';
  remainingSec: number;
  warnLevel: 0 | 1 | 2 | 3;
  walletBalance: number;
  bonusBalance: number;
  billedSeconds: number;
  /** Paise charged on this tick (lets callers compute the new cumulative total
   *  without a second read — Firestore forbids reads after writes in a txn). */
  chargedPaise: number;
  /** True on the single tick where a one-time grace minute was granted. */
  graceGranted?: boolean;
}

/** Which party drove this tick. Only a party's OWN tick advances that party's
 *  presence marker; the sweep and admin-ended ticks are 'system' and advance
 *  neither, so they can never mark an absent party as present. */
export type TickerParty = 'customer' | 'astrologer' | 'system';

/**
 * Core tick applied inside a transaction. Shared by the callable and the
 * scheduled sweep. Returns null if the session is not billable (not active).
 *
 * The meter runs only while BOTH participating parties are present. Each party's
 * own tick stamps its presence; the billable frontier is the EARLIER of the two
 * presences plus one settle window (MAX_TICK_ELAPSED_MS). So if EITHER party
 * force-quits/drops, billing halts a settle window later and the sweep pauses the
 * session — the customer is never charged for the astrologer's dead air, nor the
 * astrologer's presence billed to an absent customer. AI sessions have no
 * astrologer heartbeat, so the astrologer side is simply not required until it
 * has ever ticked.
 */
export async function applyTick(
  tx: Transaction,
  consultationId: string,
  config: GlobalConfig,
  nowMs: number,
  networkStatus?: NetworkStatus,
  ticker: TickerParty = 'system',
): Promise<TickOutcome | null> {
  const consultationRef = db.collection(Collections.consultations).doc(consultationId);
  const snap = await tx.get(consultationRef);
  if (!snap.exists) return null;
  const c = snap.data()!;
  if (c.status !== 'active') return null;

  const userRef = db.collection(Collections.users).doc(c.customerId);
  const userSnap = await tx.get(userRef);
  if (!userSnap.exists) return null;
  const user = userSnap.data()!;

  const lastTickAtMs: number = (c.lastTickAt as Timestamp | null)?.toMillis() ?? nowMs;

  // Presence of each party, with the CALLER's own presence refreshed to now.
  const custLastMs: number = ticker === 'customer'
    ? nowMs
    : ((c.customerLastTickAt as Timestamp | null)?.toMillis() ?? lastTickAtMs);
  // The astrologer side is "tracked" only once it has ever ticked (never true for
  // AI sessions). Until then, only customer presence gates the meter.
  const astroTracked = ticker === 'astrologer' || c.astrologerLastTickAt != null;
  const astroLastMs: number = ticker === 'astrologer'
    ? nowMs
    : ((c.astrologerLastTickAt as Timestamp | null)?.toMillis() ?? nowMs);

  // Bill only up to the EARLIER confirmed presence + one settle window, clamp the
  // single-tick span, and never go backwards.
  const frontierMs = astroTracked ? Math.min(custLastMs, astroLastMs) : custLastMs;
  let billToMs = Math.min(nowMs, frontierMs + MAX_TICK_ELAPSED_MS);
  billToMs = Math.min(billToMs, lastTickAtMs + MAX_TICK_ELAPSED_MS);
  billToMs = Math.max(billToMs, lastTickAtMs);

  // Balance buckets. `bonusBalance` is the any-type bonus (referral/grace);
  // `chatBonusBalance` is the CHAT-ONLY welcome credit. It is spendable only on
  // an ELIGIBLE chat (AI / base-rate astrologer) — the flag is stamped on the
  // session at creation. A premium chat never reads or writes this bucket.
  const isChat = c.type === 'chat';
  const chatCreditEligible = isChat && c.chatCreditEligible === true;
  const wallet0: number = user.walletBalance ?? 0;
  const anyBonus0: number = user.bonusBalance ?? 0;
  const chatBonus0: number = chatCreditEligible ? (user.chatBonusBalance ?? 0) : 0;
  const combinedBonus = anyBonus0 + chatBonus0;

  const result = computeTick({
    lastTickAtMs,
    nowMs: billToMs,
    pausedSinceLastTickMs: 0,
    spendablePaise: wallet0 + combinedBonus,
    walletBalancePaise: wallet0,
    bonusBalancePaise: combinedBonus,
    pricePerMinutePaise: c.pricePerMinute,
    // Running totals so billing is cumulative (round once vs the total), which
    // removes the per-tick rounding drift on rates not divisible by 60.
    priorBilledSec: (c.billedSeconds as number) ?? 0,
    priorChargedPaise: (c.totalCharged as number) ?? 0,
    warnLevel1Sec: config.warnLevel1Sec,
    warnLevel2Sec: config.warnLevel2Sec,
  });

  // Split the bonus the engine consumed back into its buckets — spend the
  // chat-only welcome credit FIRST, then the any-type bonus.
  const consumedBonus = combinedBonus - result.newBonusBalancePaise;
  const chatConsumed = Math.min(chatBonus0, consumedBonus);
  const newChatBonus = chatBonus0 - chatConsumed;
  const newAnyBonus = anyBonus0 - (consumedBonus - chatConsumed);

  // One grace minute when the balance runs out — CHAT ONLY, once per USER
  // (`chatGraceUsed`), so closing/reopening the app never re-grants it. VOICE &
  // VIDEO get NO grace: when their balance hits ₹0 the session pauses (the
  // low-balance "Recharge now" warning fires ~1 min before that). The grace
  // credit lands in the any-type bonus so it is spendable on this same session.
  const graceMinutes = config.graceMinutes ?? 0;
  const grantGrace = isChat && result.exhausted && user.chatGraceUsed !== true && graceMinutes > 0;
  const graceBonus = grantGrace ? graceMinutes * (c.pricePerMinute as number) : 0;
  const willPause = result.exhausted && !grantGrace;

  const finalWallet = result.newWalletBalancePaise;
  const finalAnyBonus = newAnyBonus + graceBonus;
  const finalChatBonus = newChatBonus;
  const finalSpendable = finalWallet + finalAnyBonus + (chatCreditEligible ? finalChatBonus : 0);
  const finalRemainingSec = grantGrace
    ? affordableSeconds(finalSpendable, c.pricePerMinute)
    : result.remainingSec;
  const finalWarnLevel = grantGrace
    ? deriveWarnLevel(finalRemainingSec, false, config.warnLevel1Sec, config.warnLevel2Sec)
    : result.warnLevel;

  if (result.chargedPaise > 0 || graceBonus > 0) {
    tx.update(userRef, {
      walletBalance: finalWallet,
      bonusBalance: finalAnyBonus,
      // Only an eligible chat consumes the chat-only welcome credit; never touch
      // it on a call or a premium chat (leave the bucket exactly as it was).
      ...(chatCreditEligible ? { chatBonusBalance: finalChatBonus } : {}),
      ...(grantGrace && isChat ? { chatGraceUsed: true } : {}),
      ...(result.chargedPaise > 0 ? { totalSpent: FieldValue.increment(result.chargedPaise) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  if (result.chargedPaise > 0) {
    writeLedger(tx, {
      userId: c.customerId,
      kind: 'consultation',
      amount: -result.chargedPaise,
      balanceBefore: wallet0 + combinedBonus,
      balanceAfter: result.remainingSpendablePaise,
      refId: consultationId,
      note: `${c.type} consultation billing`,
    });
  }
  if (graceBonus > 0) {
    writeLedger(tx, {
      userId: c.customerId,
      kind: 'bonus',
      amount: graceBonus,
      balanceBefore: result.remainingSpendablePaise,
      balanceAfter: finalSpendable,
      refId: consultationId,
      note: `Grace bonus — ${graceMinutes} free minute`,
    });
  }

  // Track how this charge was FUNDED (real wallet vs non-withdrawable bonus/grace)
  // so a later refund returns money to the right bucket instead of turning free
  // credit into withdrawable cash (P3-7).
  const chargedFromBonusThisTick = consumedBonus;
  const chargedFromWalletThisTick = Math.max(0, result.chargedPaise - consumedBonus);

  // Advance the billed-to marker only by the WHOLE seconds actually billed, not
  // all the way to billToMs. computeTick floors the elapsed span to whole
  // seconds, so the <1s remainder must carry into the next tick — otherwise it
  // is silently dropped every tick (a small systematic under-charge). This is
  // always <= billToMs, so it still can't push billing past the presence
  // frontier, and never goes backwards (billedSeconds >= 0).
  const billedToMs = lastTickAtMs + result.billedSeconds * 1000;

  tx.update(consultationRef, {
    billedSeconds: FieldValue.increment(result.billedSeconds),
    totalCharged: FieldValue.increment(result.chargedPaise),
    chargedFromWallet: FieldValue.increment(chargedFromWalletThisTick),
    chargedFromBonus: FieldValue.increment(chargedFromBonusThisTick),
    walletAfter: finalSpendable,
    remainingSec: finalRemainingSec,
    warnLevel: finalWarnLevel,
    lastTickAt: Timestamp.fromMillis(billedToMs),
    // Record each party's true last-seen time only when they drove the tick.
    ...(ticker === 'customer' ? { customerLastTickAt: Timestamp.fromMillis(nowMs) } : {}),
    ...(ticker === 'astrologer' ? { astrologerLastTickAt: Timestamp.fromMillis(nowMs) } : {}),
    networkStatus: networkStatus ?? c.networkStatus ?? 'ok',
    // Grace/pause happen at the instant the balance was exhausted = the billed
    // frontier, not the later billToMs.
    ...(grantGrace ? { graceGranted: true, graceGrantedAt: Timestamp.fromMillis(billedToMs) } : {}),
    ...(willPause ? { status: 'paused', pausedAt: Timestamp.fromMillis(billedToMs) } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    status: willPause ? 'paused' : 'active',
    remainingSec: finalRemainingSec,
    warnLevel: finalWarnLevel,
    walletBalance: finalWallet,
    bonusBalance: finalAnyBonus + (chatCreditEligible ? finalChatBonus : 0),
    billedSeconds: result.billedSeconds,
    chargedPaise: result.chargedPaise,
    graceGranted: grantGrace,
  };
}

export const tickConsultation = onCall(async (req) => {
  const uid = assertAuthed(req);
  const { consultationId, networkStatus } = (req.data ?? {}) as {
    consultationId?: string;
    networkStatus?: NetworkStatus;
  };
  if (!consultationId) badRequest('consultationId is required.');

  const config = await getGlobalConfig();
  const nowMs = Timestamp.now().toMillis();

  const outcome = await db.runTransaction(async (tx) => {
    const ref = db.collection(Collections.consultations).doc(consultationId!);
    const snap = await tx.get(ref);
    if (!snap.exists) notFound('Consultation not found.');
    const c = snap.data()!;
    if (uid !== c.customerId && uid !== c.astrologerId && req.auth?.token?.role !== 'admin') {
      failedPrecondition('Not a participant of this consultation.');
    }
    // Each party's own heartbeat advances only its own presence marker; the meter
    // bills only up to the earlier of the two. An admin tick is 'system'.
    const ticker: TickerParty =
      uid === c.customerId ? 'customer' : uid === c.astrologerId ? 'astrologer' : 'system';
    return applyTick(tx, consultationId!, config, nowMs, networkStatus, ticker);
  });

  if (!outcome) {
    // Session already ended/paused — return a stable, non-billable response.
    const snap = await db.collection(Collections.consultations).doc(consultationId!).get();
    const c = snap.data();
    return {
      status: c?.status ?? 'completed',
      remainingSec: c?.remainingSec ?? 0,
      warnLevel: c?.warnLevel ?? 3,
    };
  }
  return outcome;
});
