import {
  computeTick,
  deriveWarnLevel,
  canStartConsultation,
  astrologerNetEarning,
  MAX_TICK_ELAPSED_MS,
  TickInput,
} from './engine';
import {
  chargeForSeconds,
  affordableSeconds,
  pricePerSecond,
  rupeesToPaise,
} from '../common/money';

const PRICE = 900; // ₹9/min in paise
const WARN1 = 120;
const WARN2 = 30;

function baseInput(overrides: Partial<TickInput> = {}): TickInput {
  return {
    lastTickAtMs: 0,
    nowMs: 0,
    walletBalancePaise: 100000, // ₹1000 — effectively unlimited for short ticks
    bonusBalancePaise: 0,
    spendablePaise: 100000,
    pricePerMinutePaise: PRICE,
    warnLevel1Sec: WARN1,
    warnLevel2Sec: WARN2,
    ...overrides,
  };
}

describe('money helpers', () => {
  it('derives ₹0.15/sec from ₹9/min', () => {
    expect(pricePerSecond(PRICE)).toBeCloseTo(15, 10); // 15 paise/sec
  });
  it('charges exact paise for whole seconds', () => {
    expect(chargeForSeconds(PRICE, 1)).toBe(15);
    expect(chargeForSeconds(PRICE, 60)).toBe(900);
    expect(chargeForSeconds(PRICE, 0)).toBe(0);
    expect(chargeForSeconds(PRICE, -5)).toBe(0);
  });
  it('computes affordable seconds by flooring', () => {
    expect(affordableSeconds(900, PRICE)).toBe(60);
    expect(affordableSeconds(20, PRICE)).toBe(1); // 20p buys 1 full second (15p)
    expect(affordableSeconds(14, PRICE)).toBe(0); // can't afford a whole second
  });
  it('rupeesToPaise rounds correctly', () => {
    expect(rupeesToPaise(9)).toBe(900);
    expect(rupeesToPaise(0.15)).toBe(15);
    expect(rupeesToPaise(99)).toBe(9900);
  });
});

describe('computeTick — Part 4 duration matrix', () => {
  it('10-second session', () => {
    const r = computeTick(baseInput({ lastTickAtMs: 0, nowMs: 10_000 }));
    expect(r.billedSeconds).toBe(10);
    expect(r.chargedPaise).toBe(150); // 10 * 15
    expect(r.exhausted).toBe(false);
  });

  it('1-minute session charges ₹9 (accumulated over 10s ticks)', () => {
    let billed = 0, charged = 0;
    for (let i = 0; i < 6; i++) {
      const r = computeTick(baseInput({ lastTickAtMs: 0, nowMs: 10_000, priorBilledSec: billed, priorChargedPaise: charged }));
      billed += r.billedSeconds; charged += r.chargedPaise;
    }
    expect(billed).toBe(60);
    expect(charged).toBe(900); // ₹9
  });

  // Long sessions are billed as MANY 10s ticks (a single tick is clamped to the
  // settle window — see MAX_TICK_ELAPSED_MS), so we accumulate to verify the total.
  it('30-minute session charges ₹270 (accumulated over 10s ticks)', () => {
    let billed = 0, charged = 0;
    for (let i = 0; i < 180; i++) {
      const r = computeTick(baseInput({ lastTickAtMs: 0, nowMs: 10_000, priorBilledSec: billed, priorChargedPaise: charged }));
      billed += r.billedSeconds; charged += r.chargedPaise;
    }
    expect(billed).toBe(1800);
    expect(charged).toBe(27000); // ₹270
  });

  it('2-hour session charges ₹1080 (accumulated over 10s ticks)', () => {
    let billed = 0, charged = 0;
    for (let i = 0; i < 720; i++) {
      const r = computeTick(baseInput({
        walletBalancePaise: rupeesToPaise(2000), spendablePaise: rupeesToPaise(2000),
        lastTickAtMs: 0, nowMs: 10_000, priorBilledSec: billed, priorChargedPaise: charged,
      }));
      billed += r.billedSeconds; charged += r.chargedPaise;
    }
    expect(billed).toBe(7200);
    expect(charged).toBe(108000); // ₹1080
  });

  it('ignores sub-second remainder (partial seconds not billed)', () => {
    const r = computeTick(baseInput({ lastTickAtMs: 0, nowMs: 10_900 }));
    expect(r.billedSeconds).toBe(10); // 0.9s dropped
    expect(r.chargedPaise).toBe(150);
  });
});

describe('computeTick — exhaustion & clamping', () => {
  it('never charges more than spendable and flips exhausted', () => {
    // ₹0.30 balance = 2 seconds of talk-time; ask for 10s.
    const r = computeTick(baseInput({
      walletBalancePaise: 30,
      bonusBalancePaise: 0,
      spendablePaise: 30,
      lastTickAtMs: 0,
      nowMs: 10_000,
    }));
    expect(r.billedSeconds).toBe(2);
    expect(r.chargedPaise).toBe(30);
    expect(r.newWalletBalancePaise).toBe(0);
    expect(r.remainingSpendablePaise).toBe(0);
    expect(r.exhausted).toBe(true);
    expect(r.warnLevel).toBe(3);
  });

  it('wallet never goes negative even with a huge elapsed gap', () => {
    const r = computeTick(baseInput({
      walletBalancePaise: 45, // 3 seconds
      bonusBalancePaise: 0,
      spendablePaise: 45,
      lastTickAtMs: 0,
      nowMs: 10 * 60_000, // 10 minutes elapsed (e.g. missed heartbeats)
    }));
    expect(r.chargedPaise).toBe(45);
    expect(r.newWalletBalancePaise).toBe(0);
    expect(r.exhausted).toBe(true);
  });
});

describe('computeTick — bonus-first deduction', () => {
  it('consumes bonus before wallet', () => {
    // 10s = 150p. bonus=100p, wallet=1000p.
    const r = computeTick(baseInput({
      walletBalancePaise: 1000,
      bonusBalancePaise: 100,
      spendablePaise: 1100,
      lastTickAtMs: 0,
      nowMs: 10_000,
    }));
    expect(r.chargedPaise).toBe(150);
    expect(r.newBonusBalancePaise).toBe(0); // bonus drained first
    expect(r.newWalletBalancePaise).toBe(1000 - 50); // remaining 50p from wallet
  });
});

describe('computeTick — paused time is excluded', () => {
  it('does not bill the paused span', () => {
    // 20s wall-clock but 12s paused → bill 8s (both within the single-tick clamp).
    const r = computeTick(baseInput({
      lastTickAtMs: 0,
      nowMs: 20_000,
      pausedSinceLastTickMs: 12_000,
    }));
    expect(r.billedSeconds).toBe(8);
    expect(r.chargedPaise).toBe(120);
  });
});

describe('deriveWarnLevel', () => {
  it('maps thresholds correctly', () => {
    expect(deriveWarnLevel(300, false, WARN1, WARN2)).toBe(0);
    expect(deriveWarnLevel(120, false, WARN1, WARN2)).toBe(1);
    expect(deriveWarnLevel(45, false, WARN1, WARN2)).toBe(1);
    expect(deriveWarnLevel(30, false, WARN1, WARN2)).toBe(2);
    expect(deriveWarnLevel(5, false, WARN1, WARN2)).toBe(2);
    expect(deriveWarnLevel(0, true, WARN1, WARN2)).toBe(3);
  });
});

describe('canStartConsultation', () => {
  it('requires the configured minimum spendable', () => {
    expect(canStartConsultation(1800, 1800)).toBe(true);
    expect(canStartConsultation(1799, 1800)).toBe(false);
    expect(canStartConsultation(0, 1800)).toBe(false);
  });
});

describe('astrologerNetEarning', () => {
  it('applies commission percentage', () => {
    expect(astrologerNetEarning(1000, 20)).toBe(800);
    expect(astrologerNetEarning(900, 20)).toBe(720);
    expect(astrologerNetEarning(0, 20)).toBe(0);
  });
});

describe('computeTick — cumulative billing (P2-5, no per-tick rounding drift)', () => {
  const RATE_25 = 2500; // ₹25/min = 41.6667 paise/sec — NOT divisible by 60
  const pps25 = pricePerSecond(RATE_25);

  it('a single tick is clamped to the settle window (₹25/min → round(pps*15))', () => {
    const r = computeTick(
      baseInput({ lastTickAtMs: 0, nowMs: 60_000, pricePerMinutePaise: RATE_25 }),
    );
    expect(r.billedSeconds).toBe(15); // clamped from 60s; the full 2500 accrues over ticks (next test)
    expect(r.chargedPaise).toBe(Math.round(pps25 * 15));
  });

  it('six 10s ticks total EXACTLY round(pps*60), not the per-tick-rounded 2502', () => {
    let billed = 0;
    let charged = 0;
    // Old per-tick behaviour would charge round(pps*10)=417 each → 6*417 = 2502.
    for (let i = 0; i < 6; i++) {
      const r = computeTick(
        baseInput({
          lastTickAtMs: 0,
          nowMs: 10_000,
          pricePerMinutePaise: RATE_25,
          priorBilledSec: billed,
          priorChargedPaise: charged,
        }),
      );
      billed += r.billedSeconds;
      charged += r.chargedPaise;
    }
    expect(billed).toBe(60);
    expect(charged).toBe(2500); // exact — not 2502
    // Invariant: cumulative charged == round(pps * cumulative billed).
    expect(charged).toBe(Math.round(pps25 * billed));
  });

  it('maintains totalCharged == round(pps*billed) across many uneven ticks', () => {
    const spans = [7000, 3000, 11000, 5000, 9000, 13000, 2000, 10000]; // uneven ms
    let billed = 0;
    let charged = 0;
    for (const ms of spans) {
      const r = computeTick(
        baseInput({
          lastTickAtMs: 0,
          nowMs: ms,
          pricePerMinutePaise: RATE_25,
          priorBilledSec: billed,
          priorChargedPaise: charged,
        }),
      );
      billed += r.billedSeconds;
      charged += r.chargedPaise;
      expect(charged).toBe(Math.round(pps25 * billed)); // invariant holds every tick
    }
  });

  it('still caps at spendable when the balance runs out mid-tick', () => {
    // 600 paise spendable at 41.6667 p/s → floor(600/41.6667) = 14 whole seconds.
    const r = computeTick(
      baseInput({
        lastTickAtMs: 0,
        nowMs: 60_000,
        pricePerMinutePaise: RATE_25,
        walletBalancePaise: 600,
        bonusBalancePaise: 0,
        spendablePaise: 600,
      }),
    );
    expect(r.billedSeconds).toBe(14);
    expect(r.chargedPaise).toBeLessThanOrEqual(600);
    expect(r.chargedPaise).toBe(Math.round(pps25 * 14)); // 583
    expect(r.exhausted).toBe(true);
  });
});

describe('computeTick — single-tick elapsed clamp (P1-2, MAX_TICK_ELAPSED_MS)', () => {
  it('bills at most the settle window for one huge catch-up tick', () => {
    const r = computeTick(baseInput({ lastTickAtMs: 0, nowMs: 90_000 }));
    expect(r.billedSeconds).toBe(15); // clamped from 90s
    expect(r.chargedPaise).toBe(225); // 15 * 15p
  });
  it('a normal-sized tick is unaffected by the clamp', () => {
    const r = computeTick(baseInput({ lastTickAtMs: 0, nowMs: 10_000 }));
    expect(r.billedSeconds).toBe(10);
    expect(r.chargedPaise).toBe(150);
  });
  it('cumulative invariant holds after a clamped tick', () => {
    const r = computeTick(baseInput({ lastTickAtMs: 0, nowMs: 90_000, priorBilledSec: 30, priorChargedPaise: 450 }));
    // billed 15 more (clamped) → 45 total; charge == round(pps * 45) - 450.
    const pps = pricePerSecond(PRICE);
    expect(450 + r.chargedPaise).toBe(Math.round(pps * (30 + r.billedSeconds)));
  });
  it('the live clamp equals the sweep settle window', () => {
    expect(MAX_TICK_ELAPSED_MS).toBe(15_000);
  });
});
