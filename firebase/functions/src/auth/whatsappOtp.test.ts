/**
 * Unit tests for the pure WhatsApp OTP logic (no Firestore / network / secrets).
 * Covers phone parsing, the HMAC hash + timing-safe compare, and the verify
 * state machine (expired / locked / mismatch / ok) exhaustively.
 */
import { normalizePhone, computeCodeHash, hashesMatch, decideVerify } from './whatsappOtpLogic';

const PEPPER = 'test-pepper-secret';

describe('normalizePhone', () => {
  it('accepts a valid E.164 number and splits it', () => {
    expect(normalizePhone('+919718363223')).toEqual({ e164: '+919718363223', digits: '919718363223' });
  });
  it('trims surrounding whitespace', () => {
    expect(normalizePhone('  +919718363223  ')).toEqual({ e164: '+919718363223', digits: '919718363223' });
  });
  it('rejects a number without the leading +', () => {
    expect(normalizePhone('919718363223')).toBeNull();
  });
  it('rejects numbers with inner spaces or separators', () => {
    expect(normalizePhone('+91 97183 63223')).toBeNull();
    expect(normalizePhone('+91-9718363223')).toBeNull();
  });
  it('rejects too-short and too-long numbers', () => {
    expect(normalizePhone('+1234567')).toBeNull(); // 7 digits
    expect(normalizePhone('+1234567890123456')).toBeNull(); // 16 digits
  });
  it('rejects letters, empty, null, undefined', () => {
    expect(normalizePhone('+91abcd363223')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe('computeCodeHash + hashesMatch', () => {
  const e164 = '+919718363223';
  it('is deterministic for the same inputs', () => {
    expect(computeCodeHash('123456', e164, PEPPER)).toBe(computeCodeHash('123456', e164, PEPPER));
  });
  it('never stores the raw code (hash != code)', () => {
    expect(computeCodeHash('123456', e164, PEPPER)).not.toContain('123456');
  });
  it('changes with the code', () => {
    expect(computeCodeHash('123456', e164, PEPPER)).not.toBe(computeCodeHash('123457', e164, PEPPER));
  });
  it('changes with the phone (code is bound to the number)', () => {
    expect(computeCodeHash('123456', e164, PEPPER)).not.toBe(computeCodeHash('123456', '+911111111111', PEPPER));
  });
  it('changes with the pepper', () => {
    expect(computeCodeHash('123456', e164, PEPPER)).not.toBe(computeCodeHash('123456', e164, 'other-pepper'));
  });
  it('hashesMatch true for identical hashes, false otherwise', () => {
    const h = computeCodeHash('123456', e164, PEPPER);
    expect(hashesMatch(h, h)).toBe(true);
    expect(hashesMatch(h, computeCodeHash('000000', e164, PEPPER))).toBe(false);
  });
  it('hashesMatch handles unequal length without throwing', () => {
    expect(hashesMatch('abc', 'abcd')).toBe(false);
    expect(hashesMatch('', 'x')).toBe(false);
  });
});

describe('decideVerify', () => {
  const e164 = '+919718363223';
  const now = 1_000_000;
  const good = computeCodeHash('123456', e164, PEPPER);
  const base = {
    exists: true,
    expiresAtMs: now + 60_000, // not expired
    attempts: 0,
    storedHash: good,
    providedHash: good,
    nowMs: now,
    maxAttempts: 5,
  };

  it('correct code within window → ok, attempt counted', () => {
    expect(decideVerify(base)).toEqual({ state: 'ok', newAttempts: 1 });
  });
  it('missing doc → expired', () => {
    expect(decideVerify({ ...base, exists: false })).toEqual({ state: 'expired', newAttempts: 0 });
  });
  it('past expiry → expired (even with the right code)', () => {
    expect(decideVerify({ ...base, expiresAtMs: now - 1 })).toEqual({ state: 'expired', newAttempts: 0 });
  });
  it('wrong code → mismatch, attempt incremented', () => {
    const bad = computeCodeHash('000000', e164, PEPPER);
    expect(decideVerify({ ...base, providedHash: bad })).toEqual({ state: 'mismatch', newAttempts: 1 });
  });
  it('exceeding max attempts → locked (before hash is even checked)', () => {
    // 5 prior attempts, this is the 6th → over the cap of 5.
    expect(decideVerify({ ...base, attempts: 5 })).toEqual({ state: 'locked', newAttempts: 6 });
  });
  it('last allowed attempt with correct code → ok', () => {
    expect(decideVerify({ ...base, attempts: 4 })).toEqual({ state: 'ok', newAttempts: 5 });
  });
  it('last allowed attempt with wrong code → mismatch (not yet locked)', () => {
    const bad = computeCodeHash('999999', e164, PEPPER);
    expect(decideVerify({ ...base, attempts: 4, providedHash: bad })).toEqual({ state: 'mismatch', newAttempts: 5 });
  });
});
