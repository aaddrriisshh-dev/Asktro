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
import { assertAuthed, badRequest, failedPrecondition } from '../common/errors';
import { enforceRateLimit } from '../common/rateLimit';

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

    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) qs.set(k, String(v));
    const url = `${API_BASE}${path}${qs.toString() ? `?${qs.toString()}` : ''}`;

    const doFetch = async (token: string) =>
      fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });

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
        return { ok: true, contentType: 'image/svg+xml', data: { svg } };
      }
      const json = (await res.json().catch(() => null)) as { data?: unknown; errors?: unknown } | null;
      if (!res.ok) {
        logger.error('prokeralaAstrology upstream error', { path, status: res.status, errors: json?.errors });
        failedPrecondition('Astrology service is temporarily unavailable.');
      }
      return { ok: true, data: json?.data ?? json };
    } catch (e) {
      logger.error('prokeralaAstrology failed', { path, error: e instanceof Error ? e.message : String(e) });
      failedPrecondition('Astrology service is temporarily unavailable.');
    }
  },
);
