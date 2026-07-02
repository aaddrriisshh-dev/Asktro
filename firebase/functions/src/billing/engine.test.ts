import {
  computeTick,
  deriveWarnLevel,
  canStartConsultation,
  astrologerNetEarning,
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

  it('1-minute session', () => {
    const r = computeTick(baseInput({ lastTickAtMs: 0, nowMs: 60_000 }));
    expect(r.billedSeconds).toBe(60);
    expect(r.chargedPaise).toBe(900); // ₹9
  });

  it('30-minute session charges ₹270', () => {
    const r = computeTick(baseInput({
      walletBalancePaise: rupeesToPaise(500),
      bonusBalancePaise: 0,
      lastTickAtMs: 0,
      nowMs: 30 * 60_000,
    }));
    expect(r.billedSeconds).toBe(1800);
    expect(r.chargedPaise).toBe(27000); // ₹270
    expect(r.newWalletBalancePaise).toBe(rupeesToPaise(500) - 27000);
  });

  it('2-hour session charges ₹1080', () => {
    const r = computeTick(baseInput({
      walletBalancePaise: rupeesToPaise(2000),
      lastTickAtMs: 0,
      nowMs: 120 * 60_000,
    }));
    expect(r.billedSeconds).toBe(7200);
    expect(r.chargedPaise).toBe(108000); // ₹1080
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
    // 60s wall-clock but 20s paused → bill 40s.
    const r = computeTick(baseInput({
      lastTickAtMs: 0,
      nowMs: 60_000,
      pausedSinceLastTickMs: 20_000,
    }));
    expect(r.billedSeconds).toBe(40);
    expect(r.chargedPaise).toBe(600);
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
