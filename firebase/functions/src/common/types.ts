/** Shared TypeScript types mirroring the Firestore data model. */
import { Timestamp } from 'firebase-admin/firestore';

export type ConsultationType = 'chat' | 'voice' | 'video';
export type ConsultationStatus =
  | 'waiting'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'expired';
export type PaymentStatus = 'pending' | 'settled';
export type NetworkStatus = 'ok' | 'reconnecting';
export type TxnKind =
  | 'recharge'
  | 'consultation'
  | 'refund'
  | 'bonus'
  | 'coupon'
  | 'adjustment';

export interface GlobalConfig {
  consultationPricePerMinutePaise: number;
  minWalletToStartPaise: number;
  warnLevel1Sec: number;
  warnLevel2Sec: number;
  reconnectTimeoutSec: number;
  sessionTimeoutSec: number;
  requestTimeoutSec: number;
  commissionPercent: number;
  /** Free chat minutes granted to a new customer at signup (as bonus credit). */
  freeChatMinutes: number;
  /** One-time grace minutes added when a live session's balance is exhausted. */
  graceMinutes: number;
  /** Max simultaneous ACTIVE chats a human astrologer may hold, so a customer
   *  never joins a queue they'll be ignored in while the meter runs. AI unlimited. */
  maxConcurrentChatsPerAstrologer?: number;
  /** Days to retain chat content before the retention purge strips it (0 = keep
   *  forever / purge disabled). Only acts when featureFlags.retention is true. */
  chatRetentionDays?: number;
  featureFlags: Record<string, boolean>;
}

export interface ConsultationDoc {
  customerId: string;
  astrologerId: string;
  type: ConsultationType;
  pricePerMinute: number; // paise snapshot (this astrologer's rate)
  pricePerSecond: number; // paise (may be fractional)
  commissionPercent: number; // platform cut snapshot for this astrologer
  status: ConsultationStatus;
  paymentStatus: PaymentStatus;
  networkStatus: NetworkStatus;
  startTime: Timestamp | null;
  endTime: Timestamp | null;
  lastTickAt: Timestamp | null;
  /** Last time the CUSTOMER party heartbeated. The billing frontier never bills
   *  past this + a short settle window, so an astrologer-only heartbeat cannot
   *  drain an absent customer's wallet. */
  customerLastTickAt?: Timestamp | null;
  /** Last time the ASTROLOGER party heartbeated (unset for AI sessions). The
   *  meter bills only up to min(customer, astrologer) presence + settle window,
   *  so an astrologer drop also pauses the session. */
  astrologerLastTickAt?: Timestamp | null;
  /** Whether this chat may draw on the one-time chat-only welcome credit. */
  chatCreditEligible?: boolean;
  /** Set on the tick that granted the one-time grace minute. */
  graceGranted?: boolean;
  graceGrantedAt?: Timestamp | null;
  billedSeconds: number;
  duration: number;
  walletBefore: number;
  walletAfter: number;
  totalCharged: number;
  /** Cumulative split of totalCharged by funding source, so a refund returns
   *  money to the right bucket (real wallet vs non-withdrawable bonus/grace). */
  chargedFromWallet?: number;
  chargedFromBonus?: number;
  /** Cumulative paise refunded against this session, so partial refunds are
   *  idempotent and never exceed what was charged (see admin/refund.ts). */
  refundedPaise?: number;
  pausedAccumMs: number;
  pausedAt: Timestamp | null;
  warnLevel: 0 | 1 | 2 | 3;
  remainingSec: number;
  agoraChannel: string | null;
  rating: number | null;
  review: string | null;
  receiptNo: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserDoc {
  name: string;
  phone: string;
  email?: string;
  walletBalance: number;
  bonusBalance: number;
  /** Non-withdrawable, CHAT-ONLY welcome/bonus credit — cannot fund a call. */
  chatBonusBalance?: number;
  lockedBalance: number;
  totalRecharge: number;
  totalSpent: number;
  pendingRefund: number;
  totalConsultations: number;
  /** Denormalized per-type billed seconds, incremented at settlement so the
   *  admin users table never scans the consultations collection. */
  usageSeconds?: { chat?: number; voice?: number; video?: number };
  /** True once the one-time chat grace minute has been consumed (never re-granted). */
  chatGraceUsed?: boolean;
  referralCode: string;
  referredBy?: string;
  accountStatus: 'active' | 'blocked' | 'deleted';
  /** Erasure progress after a self-service account deletion: 'pending' while the
   *  background worker drains content, 'done' once complete (see deleteAccount). */
  deletionState?: 'pending' | 'done';
  fcmTokens?: string[];
}

/** Per-UTC-day analytics rollup (dailyStats/{YYYY-MM-DD}) read by the admin
 *  dashboard so it never aggregates whole collections in the browser. Written
 *  only by the rollup triggers (stats/dailyStats.ts). */
export interface DailyStatsDoc {
  day: string; // 'YYYY-MM-DD' (UTC)
  dayMs: number; // ms at that day's UTC midnight
  /** Signed paise sums per ledger kind (recharge/bonus +, consultation/refund −). */
  revenue?: Partial<Record<TxnKind, number>>;
  /** Row counts per ledger kind. */
  counts?: Partial<Record<TxnKind, number>>;
  /** Sessions STARTED that day, by type. */
  consultations?: { chat?: number; voice?: number; video?: number };
  updatedAt: Timestamp;
}
