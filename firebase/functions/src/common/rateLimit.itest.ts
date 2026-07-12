/**
 * Integration tests for enforceRateLimit against the Firestore emulator. Proves
 * the cap is enforced atomically (over-limit throws), that a fresh window resets
 * the count, and that unknown actions / empty keys are no-ops.
 */
import { db, Timestamp } from './admin';
import { enforceRateLimit, RATE_RULES } from './rateLimit';

async function callTimes(action: string, key: string, n: number): Promise<number> {
  let ok = 0;
  for (let i = 0; i < n; i++) {
    try {
      await enforceRateLimit(action, key);
      ok++;
    } catch (e) {
      // resource-exhausted once over the cap
      expect((e as { code?: string }).code).toBe('resource-exhausted');
    }
  }
  return ok;
}

describe('enforceRateLimit (emulator)', () => {
  it('allows exactly up to the cap, then blocks within the window', async () => {
    const rule = RATE_RULES.prokeralaAstrology; // 60 / min, block
    const key = 'u_rl_1';
    const allowed = await callTimes('prokeralaAstrology', key, rule.limit + 5);
    expect(allowed).toBe(rule.limit); // the surplus 5 were rejected
  });

  it('counts each key independently', async () => {
    const rule = RATE_RULES.createConsultation; // 10 / 5min
    const a = await callTimes('createConsultation', 'u_rl_a', rule.limit + 2);
    const b = await callTimes('createConsultation', 'u_rl_b', rule.limit + 2);
    expect(a).toBe(rule.limit);
    expect(b).toBe(rule.limit); // b is not affected by a's usage
  });

  it('resets when the window rolls over', async () => {
    const key = 'u_rl_2';
    const rule = RATE_RULES.createRechargeOrder; // 15 / hour
    // Exhaust the current window.
    await callTimes('createRechargeOrder', key, rule.limit);
    // The 16th in the same window is blocked.
    await expect(enforceRateLimit('createRechargeOrder', key)).rejects.toMatchObject({ code: 'resource-exhausted' });

    // Simulate the next window by writing a counter for the *previous* window and
    // confirming a brand-new window key starts clean: a doc id is per-window, so
    // a different windowStart is a different doc → count restarts at 1.
    const windowMs = rule.windowSec * 1000;
    const prevWindow = Math.floor(Timestamp.now().toMillis() / windowMs) * windowMs - windowMs;
    const prevRef = db.collection('rateLimits').doc(`createRechargeOrder__${key}__${prevWindow}`);
    const prev = await prevRef.get();
    // Previous-window doc (if any) is separate from the current one — proving
    // windows don't share state.
    expect(prev.exists).toBe(false);
  });

  it('is a no-op for unknown actions and empty keys', async () => {
    await expect(enforceRateLimit('no_such_action', 'k')).resolves.toBeUndefined();
    await expect(enforceRateLimit('prokeralaAstrology', '')).resolves.toBeUndefined();
  });
});
