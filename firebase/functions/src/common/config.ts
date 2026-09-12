/** Reads the admin-managed global config with safe defaults. */
import { db } from './admin';
import { ConfigDoc } from './collections';
import { GlobalConfig } from './types';

export const DEFAULT_CONFIG: GlobalConfig = {
  consultationPricePerMinutePaise: 900, // ₹9/min
  maxConsultationPricePerMinutePaise: 50000, // ₹500/min hard ceiling — sanity clamp
  minWalletToStartPaise: 1800, // 2 minutes
  warnLevel1Sec: 60, // low-balance popup fires ~1 minute before exhaustion
  warnLevel2Sec: 20,
  reconnectTimeoutSec: 45,
  sessionTimeoutSec: 300,
  requestTimeoutSec: 90, // a waiting request auto-expires if unaccepted this long
  commissionPercent: 20,
  freeChatMinutes: 3, // welcome free chat minutes for new customers
  graceMinutes: 1, // one free grace minute when balance runs out mid-session
  maxConcurrentChatsPerAstrologer: 5, // fairness cap; tunable without a deploy
  // Retention windows (used only when featureFlags.retention is true). Sensible
  // defaults so enabling the master flag applies standard periods; each is
  // overridable from the portal without a deploy.
  chatRetentionDays: 90, // strip chat text/media from ended chats after 90 days
  notificationRetentionDays: 30, // delete in-app notifications after 30 days
  alertRetentionDays: 60, // delete internal ops alerts after 60 days
  featureFlags: {
    voice: true,
    video: true,
    referrals: true,
    retention: false, // ALL retention purges OFF until the operator flips this on
  },
};

// Per-instance cache. The billing heartbeat (tickConsultation, every 10s per
// active session) reads this same one doc constantly; caching it per warm
// instance for a short TTL cuts that to ~1 read/minute/instance. Pricing
// changes tolerate a minute of staleness, and each session already snapshots
// its own price at creation, so live consultations are never re-rated.
const CONFIG_TTL_MS = 60_000;
let _cached: GlobalConfig | null = null;
let _cachedAtMs = 0;

/**
 * Load `config/global`, merged over defaults so a missing/partial doc never
 * breaks billing. Cached per instance for CONFIG_TTL_MS. Never trust the client
 * for any of these values.
 */
export async function getGlobalConfig(): Promise<GlobalConfig> {
  // NOTE: Date.now() is fine at runtime in deployed functions.
  const now = Date.now();
  if (_cached && now - _cachedAtMs < CONFIG_TTL_MS) return _cached;

  let data: Partial<GlobalConfig> | undefined;
  try {
    const snap = await db.doc(ConfigDoc.path).get();
    data = snap.exists ? (snap.data() as Partial<GlobalConfig> | undefined) : undefined;
  } catch (err) {
    // A transient config read failure must NOT fail the whole callable (billing,
    // createConsultation, etc. all await this first). Fall back to the last good
    // cached value, or the built-in defaults — never throw.
    if (_cached) return _cached;
    return { ...DEFAULT_CONFIG, featureFlags: { ...DEFAULT_CONFIG.featureFlags } };
  }
  _cached = {
    ...DEFAULT_CONFIG,
    ...(data ?? {}),
    featureFlags: { ...DEFAULT_CONFIG.featureFlags, ...(data?.featureFlags ?? {}) },
  };
  _cachedAtMs = now;
  return _cached;
}
