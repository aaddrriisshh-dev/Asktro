/**
 * Unit tests for the ProKerala result-cache key + TTL logic. These guarantee the
 * cache can only ever serve an IDENTICAL request (no stale data, no collisions):
 *  - daily endpoints (horoscope/panchang/periods) collapse the request `datetime`
 *    to its DATE, so every call for the same day shares one entry, but a different
 *    day is a different key;
 *  - birth-fixed endpoints key on the exact params (birth datetime included);
 *  - any change to any param yields a different key.
 */
import { prokeralaCacheId, prokeralaCacheTtlMs } from './cacheKey';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('prokeralaCacheId', () => {
  it('daily endpoints: same day + same params → same key regardless of time-of-day', () => {
    const a = prokeralaCacheId('v2/horoscope/daily/advanced', { datetime: '2026-09-12T09:15:00+05:30', coordinates: '19.07,72.87', type: 'all' });
    const b = prokeralaCacheId('v2/horoscope/daily/advanced', { datetime: '2026-09-12T21:45:30+05:30', coordinates: '19.07,72.87', type: 'all' });
    expect(a).toBe(b); // one upstream call serves the whole day
  });

  it('daily endpoints: a different DATE is a different key (never serves yesterday)', () => {
    const today = prokeralaCacheId('v2/astrology/panchang/advanced', { datetime: '2026-09-12T10:00:00+05:30', coordinates: '19.07,72.87' });
    const tomorrow = prokeralaCacheId('v2/astrology/panchang/advanced', { datetime: '2026-09-13T10:00:00+05:30', coordinates: '19.07,72.87' });
    expect(today).not.toBe(tomorrow);
  });

  it('daily endpoints: different coordinates (different user) → different key', () => {
    const mumbai = prokeralaCacheId('v2/astrology/panchang/advanced', { datetime: '2026-09-12T10:00:00+05:30', coordinates: '19.07,72.87' });
    const delhi = prokeralaCacheId('v2/astrology/panchang/advanced', { datetime: '2026-09-12T10:00:00+05:30', coordinates: '28.61,77.20' });
    expect(mumbai).not.toBe(delhi);
  });

  it('birth-fixed endpoints: the full birth datetime is kept (NOT collapsed to date)', () => {
    const morning = prokeralaCacheId('v2/astrology/kundli/advanced', { datetime: '1995-06-01T06:30:00+05:30', coordinates: '19.07,72.87' });
    const evening = prokeralaCacheId('v2/astrology/kundli/advanced', { datetime: '1995-06-01T18:30:00+05:30', coordinates: '19.07,72.87' });
    expect(morning).not.toBe(evening); // a different birth time is a different chart
  });

  it('is order-independent in params but sensitive to every value', () => {
    const p1 = prokeralaCacheId('v2/astrology/kundli/advanced', { datetime: '1995-06-01T06:30:00+05:30', coordinates: '19.07,72.87', ayanamsa: 1 });
    const p2 = prokeralaCacheId('v2/astrology/kundli/advanced', { ayanamsa: 1, coordinates: '19.07,72.87', datetime: '1995-06-01T06:30:00+05:30' });
    expect(p1).toBe(p2); // key order doesn't matter
    const p3 = prokeralaCacheId('v2/astrology/kundli/advanced', { datetime: '1995-06-01T06:30:00+05:30', coordinates: '19.07,72.87', ayanamsa: 5 });
    expect(p3).not.toBe(p1); // a changed value does
  });

  it('different paths never collide', () => {
    const k = prokeralaCacheId('v2/astrology/kundli', { datetime: '1995-06-01T06:30:00+05:30', coordinates: '19.07,72.87' });
    const c = prokeralaCacheId('v2/astrology/chart', { datetime: '1995-06-01T06:30:00+05:30', coordinates: '19.07,72.87' });
    expect(k).not.toBe(c);
  });
});

describe('prokeralaCacheTtlMs', () => {
  it('daily endpoints get a short (2-day) TTL', () => {
    expect(prokeralaCacheTtlMs('v2/horoscope/daily')).toBe(2 * DAY_MS);
    expect(prokeralaCacheTtlMs('v2/astrology/inauspicious-period')).toBe(2 * DAY_MS);
  });

  it('birth-fixed endpoints get a long (30-day) TTL', () => {
    expect(prokeralaCacheTtlMs('v2/astrology/kundli/advanced')).toBe(30 * DAY_MS);
    expect(prokeralaCacheTtlMs('v2/astrology/chart')).toBe(30 * DAY_MS);
  });
});
