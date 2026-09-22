/**
 * Pure WhatsApp-OTP logic — NO Firestore / network / secrets / admin imports,
 * so it is fast and safe to unit-test. The callables in whatsappOtp.ts wire
 * these to I/O (Firestore, the WhatsApp API, secrets).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Validate + split an E.164 number. Returns null if not a plausible E.164. */
export function normalizePhone(raw: unknown): { e164: string; digits: string } | null {
  const m = String(raw ?? '').trim().match(/^\+(\d{8,15})$/);
  return m ? { e164: `+${m[1]}`, digits: m[1] } : null;
}

/** HMAC hash of the code, bound to the phone, peppered with a secret. */
export function computeCodeHash(code: string, e164: string, pepper: string): string {
  return createHmac('sha256', pepper).update(`${code}:${e164}`).digest('hex');
}

/** Constant-time hash comparison; false (never throws) on any length/type issue. */
export function hashesMatch(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try { return timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; }
}

export type VerifyState = 'expired' | 'locked' | 'mismatch' | 'ok';

/** Pure verify decision (no I/O) — the single source of truth for the state
 *  machine. The callable applies the matching Firestore side effect (delete on
 *  ok/locked/expired-present, bump attempts on mismatch). */
export function decideVerify(o: {
  exists: boolean;
  expiresAtMs: number;
  attempts: number; // attempts BEFORE this one
  storedHash: string;
  providedHash: string;
  nowMs: number;
  maxAttempts: number;
}): { state: VerifyState; newAttempts: number } {
  if (!o.exists) return { state: 'expired', newAttempts: o.attempts };
  if (o.expiresAtMs < o.nowMs) return { state: 'expired', newAttempts: o.attempts };
  const newAttempts = o.attempts + 1;
  if (newAttempts > o.maxAttempts) return { state: 'locked', newAttempts };
  if (!hashesMatch(o.storedHash, o.providedHash)) return { state: 'mismatch', newAttempts };
  return { state: 'ok', newAttempts };
}
