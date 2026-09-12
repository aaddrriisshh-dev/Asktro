/**
 * Integration tests for the daily-stats rollup against the Firestore emulator.
 * Run via: npm run test:integration.
 *
 * Verifies that folding wallet-ledger rows and consultations into per-UTC-day
 * counters accumulates the SIGNED sums, per-kind counts, and per-type session
 * counts the admin dashboard reads — the same figures it used to compute by
 * scanning the whole collections. Folds now write to RANDOM shards
 * (`dailyStats/{day}/shards/{n}`) to remove single-doc write contention; the
 * aggregator (`aggregateDay`) sums those shards into the parent `dailyStats/{day}`
 * doc the dashboard reads. So each test folds, then aggregates, then asserts the
 * parent — exactly the write→aggregate→read path that runs in production.
 */
import { db, Timestamp } from '../common/admin';
import { applyRevenueRollup, applyConsultationRollup, applyUserSignupRollup, aggregateDay } from './dailyStats';

const DAY = '2026-03-15';
const at = (h: number) => Timestamp.fromMillis(Date.parse(`${DAY}T${String(h).padStart(2, '0')}:00:00.000Z`));

describe('dailyStats rollup (emulator)', () => {
  it('accumulates signed revenue, per-kind counts, and per-type sessions into one day doc', async () => {
    // Two recharges, one bonus, one consultation debit, one refund — same UTC day.
    await applyRevenueRollup({ kind: 'recharge', amount: 10000, createdAt: at(1) }, 'r1');
    await applyRevenueRollup({ kind: 'recharge', amount: 5000, createdAt: at(2) }, 'r2');
    await applyRevenueRollup({ kind: 'bonus', amount: 2000, createdAt: at(3) }, 'r3');
    await applyRevenueRollup({ kind: 'consultation', amount: -3000, createdAt: at(4) }, 'r4');
    await applyRevenueRollup({ kind: 'refund', amount: -1500, createdAt: at(5) }, 'r5');

    await applyConsultationRollup({ type: 'chat', createdAt: at(1) }, 'c1');
    await applyConsultationRollup({ type: 'chat', createdAt: at(2) }, 'c2');
    await applyConsultationRollup({ type: 'voice', createdAt: at(3) }, 'c3');

    await aggregateDay(DAY);
    const s = (await db.collection('dailyStats').doc(DAY).get()).data()!;
    expect(s.day).toBe(DAY);
    expect(s.dayMs).toBe(Date.parse(`${DAY}T00:00:00.000Z`));
    expect(s.revenue.recharge).toBe(15000);
    expect(s.revenue.bonus).toBe(2000);
    expect(s.revenue.consultation).toBe(-3000); // signed; reader applies Math.abs
    expect(s.revenue.refund).toBe(-1500);
    expect(s.counts.recharge).toBe(2);
    expect(s.consultations.chat).toBe(2);
    expect(s.consultations.voice).toBe(1);
    expect(s.consultations.video ?? 0).toBe(0);
  });

  it('buckets by UTC day — a different day is a different doc', async () => {
    await applyRevenueRollup({ kind: 'recharge', amount: 999, createdAt: Timestamp.fromMillis(Date.parse('2026-03-16T12:00:00.000Z')) }, 'r16');
    await aggregateDay('2026-03-16');
    const other = (await db.collection('dailyStats').doc('2026-03-16').get()).data()!;
    expect(other.revenue.recharge).toBe(999);
    // The 15th doc is untouched by the 16th's write.
    await aggregateDay(DAY);
    const s = (await db.collection('dailyStats').doc(DAY).get()).data()!;
    expect(s.revenue.recharge).toBe(15000);
  });

  it('is idempotent — a redelivered event with the same source id does NOT double-count', async () => {
    // Same sourceId as 'r1' (10000) delivered again → must stay 15000, not 25000.
    await applyRevenueRollup({ kind: 'recharge', amount: 10000, createdAt: at(1) }, 'r1');
    await applyRevenueRollup({ kind: 'recharge', amount: 10000, createdAt: at(1) }, 'r1');
    await applyConsultationRollup({ type: 'chat', createdAt: at(1) }, 'c1'); // redelivered
    await aggregateDay(DAY);
    const s = (await db.collection('dailyStats').doc(DAY).get()).data()!;
    expect(s.revenue.recharge).toBe(15000);
    expect(s.counts.recharge).toBe(2);
    expect(s.consultations.chat).toBe(2);
  });

  it('folds user signups into per-day totals + gender + withEmail (idempotently)', async () => {
    await applyUserSignupRollup({ gender: 'male', email: 'a@b.c', createdAt: at(1) }, 'u1');
    await applyUserSignupRollup({ gender: 'female', createdAt: at(2) }, 'u2');
    await applyUserSignupRollup({ gender: 'male', email: 'd@e.f', createdAt: at(3) }, 'u3');
    await applyUserSignupRollup({ gender: 'male', email: 'd@e.f', createdAt: at(3) }, 'u3'); // redelivery
    await aggregateDay(DAY);
    const s = (await db.collection('dailyStats').doc(DAY).get()).data()!;
    expect(s.signups.total).toBe(3);
    expect(s.signups.male).toBe(2);
    expect(s.signups.female).toBe(1);
    expect(s.signups.withEmail).toBe(2);
  });

  it('ignores rows with no kind / non-call consultation types', async () => {
    await applyRevenueRollup({ amount: 100, createdAt: at(6) }, 'r6'); // no kind → skipped
    await applyConsultationRollup({ type: 'unknown', createdAt: at(6) }, 'c6'); // not chat/voice/video
    await aggregateDay(DAY);
    const s = (await db.collection('dailyStats').doc(DAY).get()).data()!;
    expect(s.revenue.recharge).toBe(15000); // unchanged
    expect(s.consultations.chat).toBe(2);
  });

  it('spreads folds across multiple shards, and the aggregator sums them exactly', async () => {
    // A high-volume day: 30 recharges of 100 each. With SHARD_COUNT=20 these land
    // across many shard docs (proving contention is spread), and the aggregator
    // must still sum to the exact total the dashboard needs.
    const D = '2026-03-20';
    const ts = Timestamp.fromMillis(Date.parse(`${D}T09:00:00.000Z`));
    for (let i = 0; i < 30; i++) {
      await applyRevenueRollup({ kind: 'recharge', amount: 100, createdAt: ts }, `bulk_${i}`);
    }
    const shards = await db.collection('dailyStats').doc(D).collection('shards').get();
    expect(shards.size).toBeGreaterThan(1); // load genuinely spread across shards

    await aggregateDay(D);
    const s = (await db.collection('dailyStats').doc(D).get()).data()!;
    expect(s.revenue.recharge).toBe(3000); // 30 × 100, summed across all shards
    expect(s.counts.recharge).toBe(30);
    expect(s.dayMs).toBe(Date.parse(`${D}T00:00:00.000Z`));

    // Re-running the aggregator is idempotent (parent = _base + Σ shards, base=0 here).
    await aggregateDay(D);
    const s2 = (await db.collection('dailyStats').doc(D).get()).data()!;
    expect(s2.revenue.recharge).toBe(3000);
    expect(s2.counts.recharge).toBe(30);
  });

  it('preserves pre-sharding legacy totals on the transition day (_base capture)', async () => {
    // Simulate a day that already had totals written directly to the parent BEFORE
    // sharding existed (legacy), then receives new sharded folds after the upgrade.
    const D = '2026-03-25';
    await db.collection('dailyStats').doc(D).set({
      day: D,
      dayMs: Date.parse(`${D}T00:00:00.000Z`),
      revenue: { recharge: 5000 },
      counts: { recharge: 1 },
    });
    // New post-upgrade fold goes to a shard.
    await applyRevenueRollup({ kind: 'recharge', amount: 2000, createdAt: Timestamp.fromMillis(Date.parse(`${D}T10:00:00.000Z`)) }, 'post1');

    await aggregateDay(D);
    const s = (await db.collection('dailyStats').doc(D).get()).data()!;
    expect(s.revenue.recharge).toBe(7000); // 5000 legacy + 2000 new — nothing lost
    expect(s.counts.recharge).toBe(2);

    // A second aggregation must NOT re-add the legacy base (idempotent).
    await aggregateDay(D);
    const s2 = (await db.collection('dailyStats').doc(D).get()).data()!;
    expect(s2.revenue.recharge).toBe(7000);
    expect(s2.counts.recharge).toBe(2);
  });
});
