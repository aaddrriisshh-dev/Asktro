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
import { computeTick, deriveWarnLevel } from './engine';
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

/**
 * Core tick applied inside a transaction. Shared by the callable and the
 * scheduled sweep. Returns null if the session is not billable (not active).
 */
export async function applyTick(
  tx: Transaction,
  consultationId: string,
  config: GlobalConfig,
  nowMs: number,
  networkStatus?: NetworkStatus,
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

  // Balance buckets. `bonusBalance` is the any-type bonus (referral/grace);
  // `chatBonusBalance` is the CHAT-ONLY welcome credit, counted only for a chat.
  const isChat = c.type === 'chat';
  const wallet0: number = user.walletBalance ?? 0;
  const anyBonus0: number = user.bonusBalance ?? 0;
  const chatBonus0: number = isChat ? (user.chatBonusBalance ?? 0) : 0;
  const combinedBonus = anyBonus0 + chatBonus0;

  const result = computeTick({
    lastTickAtMs,
    nowMs,
    pausedSinceLastTickMs: 0,
    spendablePaise: wallet0 + combinedBonus,
    walletBalancePaise: wallet0,
    bonusBalancePaise: combinedBonus,
    pricePerMinutePaise: c.pricePerMinute,
    warnLevel1Sec: config.warnLevel1Sec,
    warnLevel2Sec: config.warnLevel2Sec,
  });

  // Split the bonus the engine consumed back into its buckets — spend the
  // chat-only welcome credit FIRST, then the any-type bonus.
  const consumedBonus = combinedBonus - result.newBonusBalancePaise;
  const chatConsumed = Math.min(chatBonus0, consumedBonus);
  const newChatBonus = chatBonus0 - chatConsumed;
  const newAnyBonus = anyBonus0 - (consumedBonus - chatConsumed);

  // One grace minute when the balance runs out. CHAT: once per USER
  // (`chatGraceUsed`) — closing/reopening the app will NOT re-grant it.
  // VOICE/VIDEO: once per call (`graceGranted` on the consultation). The grace
  // credit lands in the any-type bonus so it is spendable on this same session.
  const graceMinutes = config.graceMinutes ?? 0;
  const graceAllowed = isChat ? user.chatGraceUsed !== true : c.graceGranted !== true;
  const grantGrace = result.exhausted && graceAllowed && graceMinutes > 0;
  const graceBonus = grantGrace ? graceMinutes * (c.pricePerMinute as number) : 0;
  const willPause = result.exhausted && !grantGrace;

  const finalWallet = result.newWalletBalancePaise;
  const finalAnyBonus = newAnyBonus + graceBonus;
  const finalChatBonus = newChatBonus;
  const finalSpendable = finalWallet + finalAnyBonus + (isChat ? finalChatBonus : 0);
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
      // Only a chat consumes the chat-only welcome credit; never touch it on a call.
      ...(isChat ? { chatBonusBalance: finalChatBonus } : {}),
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

  tx.update(consultationRef, {
    billedSeconds: FieldValue.increment(result.billedSeconds),
    totalCharged: FieldValue.increment(result.chargedPaise),
    walletAfter: finalSpendable,
    remainingSec: finalRemainingSec,
    warnLevel: finalWarnLevel,
    lastTickAt: Timestamp.fromMillis(nowMs),
    networkStatus: networkStatus ?? c.networkStatus ?? 'ok',
    ...(grantGrace ? { graceGranted: true, graceGrantedAt: Timestamp.fromMillis(nowMs) } : {}),
    ...(willPause ? { status: 'paused', pausedAt: Timestamp.fromMillis(nowMs) } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    status: willPause ? 'paused' : 'active',
    remainingSec: finalRemainingSec,
    warnLevel: finalWarnLevel,
    walletBalance: finalWallet,
    bonusBalance: finalAnyBonus + (isChat ? finalChatBonus : 0),
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
    return applyTick(tx, consultationId!, config, nowMs, networkStatus);
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
