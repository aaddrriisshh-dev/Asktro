/**
 * Pure (dependency-free) cache-key + TTL logic for the ProKerala result cache.
 * Kept separate from prokerala.ts so it can be unit-tested without initialising
 * the Firebase Admin SDK. See prokerala.ts for how the cache is used.
 *
 * The key includes ALL request params, so a cached value can only ever be served
 * to an IDENTICAL request — never stale, never another request's data. Daily
 * endpoints collapse the request `datetime` to its DATE so all of a day's calls
 * share one entry (one upstream call serves everyone asking for that day); a
 * different date is a different key, so yesterday's data is never served today.
 */
import { createHash } from 'crypto';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Endpoints whose result depends only on the DATE (not the time of day). */
export const DAILY_PATHS = new Set<string>([
  'v2/horoscope/daily',
  'v2/horoscope/daily/advanced',
  'v2/astrology/panchang',
  'v2/astrology/panchang/advanced',
  'v2/astrology/auspicious-period',
  'v2/astrology/inauspicious-period',
]);

/** Stable cache doc id for (path, params). For daily endpoints the `datetime`
 *  param is collapsed to its date (YYYY-MM-DD); every other param is included
 *  verbatim so keys never collide across semantically-different requests. */
export function prokeralaCacheId(path: string, params: Record<string, string | number>): string {
  const norm: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) norm[k] = String(v);
  if (DAILY_PATHS.has(path) && norm.datetime) norm.datetime = norm.datetime.slice(0, 10);
  const sorted = Object.keys(norm).sort().map((k) => `${k}=${norm[k]}`).join('&');
  return createHash('sha256').update(`${path}?${sorted}`).digest('hex');
}

/** Cache lifetime. Daily endpoints: 2 days (the key already partitions by date,
 *  so this only bounds storage, never correctness). Birth-fixed: 30 days. */
export function prokeralaCacheTtlMs(path: string): number {
  return DAILY_PATHS.has(path) ? 2 * DAY_MS : 30 * DAY_MS;
}
