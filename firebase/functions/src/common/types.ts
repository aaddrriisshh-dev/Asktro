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
  featureFlags: Record<string, boolean>;
}

export interface ConsultationDoc {
  customerId: string;
  astrologerId: string;
  type: ConsultationType;
  pricePerMinute: number; // paise snapshot
  pricePerSecond: number; // paise (may be fractional)
  status: ConsultationStatus;
  paymentStatus: PaymentStatus;
  networkStatus: NetworkStatus;
  startTime: Timestamp | null;
  endTime: Timestamp | null;
  lastTickAt: Timestamp | null;
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
