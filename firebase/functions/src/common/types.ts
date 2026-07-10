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
  lockedBalance: number;
  totalRecharge: number;
  totalSpent: number;
  pendingRefund: number;
  totalConsultations: number;
  referralCode: string;
  referredBy?: string;
  accountStatus: 'active' | 'blocked' | 'deleted';
  fcmTokens?: string[];
}
