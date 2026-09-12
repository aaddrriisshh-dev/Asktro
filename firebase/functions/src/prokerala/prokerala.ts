/**
 * ProKerala astrology API proxy.
 *
 * The app never talks to ProKerala directly — it calls this callable, which
 * holds the Client ID/Secret (Secret Manager), exchanges them for an OAuth2
 * access token (client-credentials grant), caches that token in-instance until
 * it expires, and forwards a WHITELISTED astrology request. This keeps the
 * secret off phones and lets us swap providers without an app update.
 *
 * Set the credentials once you have them:
 *   firebase functions:secrets:set PROKERALA_CLIENT_ID
 *   firebase functions:secrets:set PROKERALA_CLIENT_SECRET
 * (then redeploy prokeralaAstrology).
 */
import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { db, FieldValue, Timestamp } from '../common/admin';
import { assertAuthed, badRequest, failedPrecondition } from '../common/errors';
import { enforceRateLimit } from '../common/rateLimit';
import { DAY_MS, prokeralaCacheId, prokeralaCacheTtlMs } from './cacheKey';

export const PROKERALA_CLIENT_ID = defineSecret('PROKERALA_CLIENT_ID');
export const PROKERALA_CLIENT_SECRET = defineSecret('PROKERALA_CLIENT_SECRET');

const TOKEN_URL = 'https://api.prokerala.com/token';
const API_BASE = 'https://api.prokerala.com/';

// Only these ProKerala paths may be called through the proxy — prevents the
// callable from being used as an open relay. Add paths here as features ship.
const ALLOWED_PATHS = new Set<string>([
  'v2/horoscope/daily',
  'v2/horoscope/daily/advanced',
  'v2/astrology/birth-details',
  'v2/astrology/kundli',
  'v2/astrology/kundli/advanced',
  'v2/astrology/chart',           // rendered birth-chart SVG (the kundli image)
  'v2/astrology/panchang',
  'v2/astrology/panchang/advanced',
  'v2/astrology/porutham',        // marriage matching
  'v2/astrology/kundli-matching',
  'v2/astrology/auspicious-period',
  'v2/astrology/inauspicious-period', // rahu kaal, gulika, yamaganda
  'v2/astrology/nakshatra-porutham',
]);

// Result cache: identical astrology requests return identical data, so we cache
// the upstream response in Firestore and serve repeats from there instead of
// re-buying them from ProKerala. The key + TTL logic lives in ./cacheKey (pure,
// unit-tested); every cache read/write here is fail-open — any error falls
// straight through to a live fetch, so caching can never break a request.
const PROKERALA_CACHE = 'prokeralaCache';

// In-instance token cache. ProKerala tokens are short-lived; we refetch ~60s
// before expiry. Each function instance keeps its own token (fine — ProKerala
// permits concurrent tokens).
let cachedToken: { value: string; expiresAtMs: number } | null = null;

async function getToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 60_000) return cachedToken.value;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ProKerala token error ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('ProKerala token response missing access_token');
  cachedToken = {
    value: json.access_token,
    expiresAtMs: now + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

/**
 * Server-side ProKerala GET for INTERNAL callers (paid features that charge the
 * wallet themselves and don't go through the whitelisted client proxy). Returns
 * the JSON `data` object, or null on any failure — the caller decides what to do
 * (e.g. NOT charge). Reuses the same in-instance token cache as the proxy.
 */
export async function prokeralaGet(
  path: string,
  params: Record<string, string | number>,
  clientId: string,
  clientSecret: string,
): Promise<Record<string, unknown> | null> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const url = `${API_BASE}${path}${qs.toString() ? `?${qs.toString()}` : ''}`;
  const doFetch = async (token: string) =>
    fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  try {
    let token = await getToken(clientId, clientSecret);
    let res = await doFetch(token);
    if (res.status === 401) {
      cachedToken = null;
      token = await getToken(clientId, clientSecret);
      res = await doFetch(token);
    }
    // Read the body as text first so we can log ProKerala's exact error on a
    // failure (a bad-request reason, an auth message, a rate-limit note, etc.).
    const raw = await res.text().catch(() => '');
    let json: { data?: unknown } | null = null;
    try { json = raw ? (JSON.parse(raw) as { data?: unknown }) : null; } catch { json = null; }
    if (!res.ok || !json) {
      logger.error('prokeralaGet upstream error', {
        path,
        status: res.status,
        body: raw.slice(0, 600),
        params,
      });
      return null;
    }
    return (json.data ?? json) as Record<string, unknown>;
  } catch (e) {
    logger.error('prokeralaGet failed', { path, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/**
 * Callable proxy. Input: { path: 'v2/horoscope/daily', params: {...} }.
 * `params` become the query string. Returns ProKerala's JSON `data` untouched.
 */
export const prokeralaAstrology = onCall(
  { secrets: [PROKERALA_CLIENT_ID, PROKERALA_CLIENT_SECRET] },
  async (req) => {
    const uid = assertAuthed(req); // only signed-in app users
    await enforceRateLimit('prokeralaAstrology', uid);
    const { path, params } = (req.data ?? {}) as { path?: string; params?: Record<string, string | number> };
    if (!path || !ALLOWED_PATHS.has(path)) {
      badRequest('Unsupported ProKerala path.');
    }

    const clientId = PROKERALA_CLIENT_ID.value();
    const clientSecret = PROKERALA_CLIENT_SECRET.value();
    if (!clientId || !clientSecret) {
      failedPrecondition('ProKerala is not configured yet (credentials not set).');
    }

    const effectiveParams: Record<string, string | number> = { ...(params ?? {}) };
    // The advanced daily horoscope REQUIRES a `type` (all | general |
    // general,health,love). Default it to `all` so older app builds that omit
    // it still work — otherwise ProKerala 400s on an empty `type`.
    if (path === 'v2/horoscope/daily/advanced' && !effectiveParams.type) {
      effectiveParams.type = 'all';
    }

    // Serve an identical, still-fresh request straight from the result cache.
    const cacheId = prokeralaCacheId(path, effectiveParams);
    const cacheRef = db.collection(PROKERALA_CACHE).doc(cacheId);
    try {
      const hit = (await cacheRef.get()).data();
      if (hit && typeof hit.expiresAtMs === 'number' && hit.expiresAtMs > Date.now() && hit.payload) {
        return hit.payload;
      }
    } catch {
      /* fail-open — fall through to a live fetch */
    }

    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(effectiveParams)) qs.set(k, String(v));
    const url = `${API_BASE}${path}${qs.toString() ? `?${qs.toString()}` : ''}`;

    const doFetch = async (token: string) =>
      fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });

    // Store a SUCCESSFUL response for identical future requests (fail-open; a
    // failedPrecondition throws before we reach here, so errors are never cached).
    const cachePayload = (payload: unknown) => {
      const ttl = prokeralaCacheTtlMs(path);
      cacheRef.set({
        payload,
        path,
        expiresAtMs: Date.now() + ttl,
        // A Firestore TTL policy on prokeralaCache.expireAt reaps stale entries
        // (one-time console step, like rateLimits/dailyStats — see PRE_LAUNCH).
        expireAt: Timestamp.fromMillis(Date.now() + ttl + DAY_MS),
        cachedAt: FieldValue.serverTimestamp(),
      }, { merge: true }).catch(() => {});
    };

    try {
      let token = await getToken(clientId, clientSecret);
      let res = await doFetch(token);
      // If the cached token was rejected (expired early / revoked), refresh once.
      if (res.status === 401) {
        cachedToken = null;
        token = await getToken(clientId, clientSecret);
        res = await doFetch(token);
      }
      // The chart endpoint returns an SVG image, not JSON — pass it through as a
      // string the app can render/share. Everything else is JSON.
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('svg') || contentType.includes('xml') || path === 'v2/astrology/chart') {
        const svg = await res.text().catch(() => '');
        if (!res.ok) {
          logger.error('prokeralaAstrology upstream error (chart)', { path, status: res.status, body: svg.slice(0, 200) });
          failedPrecondition('Astrology service is temporarily unavailable.');
        }
        const result = { ok: true, contentType: 'image/svg+xml', data: { svg } };
        cachePayload(result);
        return result;
      }
      const json = (await res.json().catch(() => null)) as { data?: unknown; errors?: unknown } | null;
      if (!res.ok) {
        logger.error('prokeralaAstrology upstream error', { path, status: res.status, errors: json?.errors });
        failedPrecondition('Astrology service is temporarily unavailable.');
      }
      const result = { ok: true, data: json?.data ?? json };
      cachePayload(result);
      return result;
    } catch (e) {
      logger.error('prokeralaAstrology failed', { path, error: e instanceof Error ? e.message : String(e) });
      failedPrecondition('Astrology service is temporarily unavailable.');
    }
  },
);
