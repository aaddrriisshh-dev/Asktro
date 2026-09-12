/**
 * fetchWithTimeout — a `fetch` that ALWAYS gives up after `timeoutMs` instead of
 * hanging forever on a slow/dead upstream. Node's global fetch has no built-in
 * timeout, so a brown-out at Gemini/ProKerala/Slack would otherwise hold a
 * function invocation for its whole platform timeout, burning instance slots at
 * scale. On timeout the AbortController rejects the fetch with an AbortError,
 * which each caller already treats as "failed → degrade" (return null / retry).
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
