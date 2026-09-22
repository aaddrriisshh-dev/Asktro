/**
 * WhatsApp OTP login (Meta Cloud API) — the cheap primary path (~₹0.115/OTP vs
 * Firebase's ₹6.69/SMS in India). Two callables:
 *
 *   sendWhatsappOtp({ phone })          → sends a 6-digit code over WhatsApp.
 *                                          Returns { ok } — on ok:false the APP
 *                                          falls back to Firebase phone-auth SMS
 *                                          (the existing, untouched flow), so a
 *                                          number with no WhatsApp is never locked
 *                                          out.
 *   verifyWhatsappOtp({ phone, code })  → verifies the code and returns a Firebase
 *                                          custom token; the app signs in with it.
 *                                          Reuses the EXISTING uid for that phone
 *                                          (wallet/history preserved).
 *
 * Security: codes are stored HMAC-hashed (pepper = the WhatsApp token secret),
 * 5-minute expiry, max 5 verify attempts, rate-limited per number AND per IP.
 * Firestore rules must deny all client access to `otpCodes` (server-only).
 *
 * NOTE on App Check: enforcement is OFF for now (rate-limits are the guard) so a
 * mis-configured attestation can never lock users out of login on launch day.
 * Flip `enforceAppCheck: true` once the App Check console shows verified traffic.
 */
import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { randomInt } from 'node:crypto';
import { db, auth, FieldValue, Timestamp } from '../common/admin';
import { enforceRateLimit } from '../common/rateLimit';
import { badRequest, failedPrecondition } from '../common/errors';
import { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } from '../common/secrets';
import { fetchWithTimeout } from '../common/httpTimeout';
import { normalizePhone, computeCodeHash, decideVerify } from './whatsappOtpLogic';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;
const GRAPH_VERSION = 'v21.0';
const TEMPLATE_NAME = 'asktro_otp';

/** HMAC-hash the code so a DB reader can't recover it (pepper = WhatsApp token). */
function hashCode(code: string, e164: string): string {
  return computeCodeHash(code, e164, WHATSAPP_TOKEN.value());
}

/** Best-effort client IP for the anti-spray per-IP limit. */
function clientIp(req: { rawRequest?: { ip?: string; headers?: Record<string, unknown> } }): string {
  const fwd = req.rawRequest?.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.rawRequest?.ip || 'unknown';
}

/** Send the OTP template via the WhatsApp Cloud API. Returns true on accept. */
async function sendViaWhatsapp(toDigits: string, code: string): Promise<boolean> {
  const phoneId = WHATSAPP_PHONE_NUMBER_ID.value();
  const token = WHATSAPP_TOKEN.value();
  if (!phoneId || !token) { logger.error('whatsappOtp: secrets missing'); return false; }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`;
  // Authentication template: the code goes in BOTH the body and the copy-code
  // button (Meta's required shape for auth templates with a Copy-code button).
  const body = {
    messaging_product: 'whatsapp',
    to: toDigits,
    type: 'template',
    template: {
      name: TEMPLATE_NAME,
      language: { code: 'en' },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
        { type: 'button', sub_type: 'copy_code', index: '0', parameters: [{ type: 'coupon_code', coupon_code: code }] },
      ],
    },
  };
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }, 15_000);
    const txt = await res.text().catch(() => '');
    if (!res.ok) { logger.error('whatsappOtp: send failed', { status: res.status, body: txt.slice(0, 500) }); return false; }
    return true;
  } catch (e) {
    logger.error('whatsappOtp: send threw', { error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/** Reuse the existing Firebase user for this phone, or create one. */
async function uidForPhone(e164: string): Promise<string> {
  try {
    const u = await auth.getUserByPhoneNumber(e164);
    return u.uid;
  } catch {
    const created = await auth.createUser({ phoneNumber: e164 });
    return created.uid;
  }
}

export const sendWhatsappOtp = onCall(
  { secrets: [WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID] },
  async (req) => {
    const p = normalizePhone((req.data as { phone?: string } | undefined)?.phone);
    if (!p) badRequest('A valid phone number is required.');
    // Rate-limit per number AND per IP (anti-spray). Fails open on limiter fault.
    await enforceRateLimit('sendWhatsappOtp', p.digits);
    await enforceRateLimit('sendWhatsappOtpIp', clientIp(req));

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await db.collection('otpCodes').doc(p.digits).set({
      phone: p.e164,
      codeHash: hashCode(code, p.e164),
      expiresAt: Timestamp.fromMillis(Date.now() + OTP_TTL_MS),
      attempts: 0,
      createdAt: FieldValue.serverTimestamp(),
      channel: 'whatsapp',
    });

    const ok = await sendViaWhatsapp(p.digits, code);
    // Never throw on a WhatsApp failure — the app falls back to Firebase SMS.
    return { ok };
  },
);

export const verifyWhatsappOtp = onCall(
  { secrets: [WHATSAPP_TOKEN] },
  async (req) => {
    const data = (req.data as { phone?: string; code?: string } | undefined) ?? {};
    const p = normalizePhone(data.phone);
    const code = String(data.code ?? '').trim();
    if (!p) badRequest('A valid phone number is required.');
    if (!/^\d{6}$/.test(code)) badRequest('Enter the 6-digit code.');
    await enforceRateLimit('verifyWhatsappOtp', p.digits);

    const ref = db.collection('otpCodes').doc(p.digits);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.exists ? snap.data()! : undefined;
      const decision = decideVerify({
        exists: snap.exists,
        expiresAtMs: d ? (d.expiresAt as Timestamp).toMillis() : 0,
        attempts: d ? ((d.attempts as number) ?? 0) : 0,
        storedHash: d ? (d.codeHash as string) : '',
        providedHash: hashCode(code, p.e164),
        nowMs: Date.now(),
        maxAttempts: MAX_ATTEMPTS,
      });
      // Apply the side effect for the decided state.
      if (decision.state === 'mismatch') {
        tx.update(ref, { attempts: decision.newAttempts });
      } else if (snap.exists) {
        // ok / locked / expired-but-present → consume the code.
        tx.delete(ref);
      }
      return decision.state;
    });

    if (result === 'expired') failedPrecondition('This code has expired. Please request a new one.');
    if (result === 'locked') failedPrecondition('Too many attempts. Please request a new code.');
    if (result === 'mismatch') badRequest('Incorrect code. Please try again.');

    const uid = await uidForPhone(p.e164);
    const token = await auth.createCustomToken(uid);
    return { token };
  },
);
