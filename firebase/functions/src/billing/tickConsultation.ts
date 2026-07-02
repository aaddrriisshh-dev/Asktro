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
import { computeTick } from './engine';
import { writeLedger } from '../wallet/ledger';
import { GlobalConfig, NetworkStatus } from '../common/types';

export interface TickOutcome {
  status: 'active' | 'paused';
  remainingSec: number;
  warnLevel: 0 | 1 | 2 | 3;
  walletBalance: number;
  bonusBalance: number;
  billedSeconds: number;
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

  const result = computeTick({
    lastTickAtMs,
    nowMs,
    pausedSinceLastTickMs: 0,
    spendablePaise: (user.walletBalance ?? 0) + (user.bonusBalance ?? 0),
    walletBalancePaise: user.walletBalance ?? 0,
    bonusBalancePaise: user.bonusBalance ?? 0,
    pricePerMinutePaise: c.pricePerMinute,
    warnLevel1Sec: config.warnLevel1Sec,
    warnLevel2Sec: config.warnLevel2Sec,
  });

  const willPause = result.exhausted;

  if (result.chargedPaise > 0) {
    tx.update(userRef, {
      walletBalance: result.newWalletBalancePaise,
      bonusBalance: result.newBonusBalancePaise,
      totalSpent: FieldValue.increment(result.chargedPaise),
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeLedger(tx, {
      userId: c.customerId,
      kind: 'consultation',
      amount: -result.chargedPaise,
      balanceBefore: (user.walletBalance ?? 0) + (user.bonusBalance ?? 0),
      balanceAfter: result.remainingSpendablePaise,
      refId: consultationId,
      note: `${c.type} consultation billing`,
    });
  }

  tx.update(consultationRef, {
    billedSeconds: FieldValue.increment(result.billedSeconds),
    totalCharged: FieldValue.increment(result.chargedPaise),
    walletAfter: result.remainingSpendablePaise,
    remainingSec: result.remainingSec,
    warnLevel: result.warnLevel,
    lastTickAt: Timestamp.fromMillis(nowMs),
    networkStatus: networkStatus ?? c.networkStatus ?? 'ok',
    ...(willPause
      ? { status: 'paused', pausedAt: Timestamp.fromMillis(nowMs) }
      : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    status: willPause ? 'paused' : 'active',
    remainingSec: result.remainingSec,
    warnLevel: result.warnLevel,
    walletBalance: result.newWalletBalancePaise,
    bonusBalance: result.newBonusBalancePaise,
    billedSeconds: result.billedSeconds,
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
