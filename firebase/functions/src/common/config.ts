/** Reads the admin-managed global config with safe defaults. */
import { db } from './admin';
import { ConfigDoc } from './collections';
import { GlobalConfig } from './types';

export const DEFAULT_CONFIG: GlobalConfig = {
  consultationPricePerMinutePaise: 900, // ₹9/min
  minWalletToStartPaise: 1800, // 2 minutes
  warnLevel1Sec: 60, // low-balance popup fires ~1 minute before exhaustion
  warnLevel2Sec: 20,
  reconnectTimeoutSec: 45,
  sessionTimeoutSec: 300,
  requestTimeoutSec: 30,
  commissionPercent: 20,
  freeChatMinutes: 3, // welcome free chat minutes for new customers
  graceMinutes: 1, // one free grace minute when balance runs out mid-session
  featureFlags: {
    voice: true,
    video: true,
    referrals: true,
  },
};

/**
 * Load `config/global`, merged over defaults so a missing/partial doc never
 * breaks billing. Never trust the client for any of these values.
 */
export async function getGlobalConfig(): Promise<GlobalConfig> {
  const snap = await db.doc(ConfigDoc.path).get();
  if (!snap.exists) return { ...DEFAULT_CONFIG };
  const data = snap.data() as Partial<GlobalConfig> | undefined;
  return {
    ...DEFAULT_CONFIG,
    ...(data ?? {}),
    featureFlags: { ...DEFAULT_CONFIG.featureFlags, ...(data?.featureFlags ?? {}) },
  };
}
