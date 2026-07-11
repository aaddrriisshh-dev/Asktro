/**
 * Integration tests for the daily-stats rollup against the Firestore emulator.
 * Run via: npm run test:integration.
 *
 * Verifies that folding wallet-ledger rows and consultations into per-UTC-day
 * counter docs accumulates the SIGNED sums, per-kind counts, and per-type
 * session counts the admin dashboard reads — the same figures it used to
 * compute by scanning the whole collections.
 */
import { db, Timestamp } from '../common/admin';
import { applyRevenueRollup, applyConsultationRollup } from './dailyStats';

const DAY = '2026-03-15';
const at = (h: number) => Timestamp.fromMillis(Date.parse(`${DAY}T${String(h).padStart(2, '0')}:00:00.000Z`));

describe('dailyStats rollup (emulator)', () => {
  it('accumulates signed revenue, per-kind counts, and per-type sessions into one day doc', async () => {
    // Two recharges, one bonus, one consultation debit, one refund — same UTC day.
    await applyRevenueRollup({ kind: 'recharge', amount: 10000, createdAt: at(1) });
    await applyRevenueRollup({ kind: 'recharge', amount: 5000, createdAt: at(2) });
    await applyRevenueRollup({ kind: 'bonus', amount: 2000, createdAt: at(3) });
    await applyRevenueRollup({ kind: 'consultation', amount: -3000, createdAt: at(4) });
    await applyRevenueRollup({ kind: 'refund', amount: -1500, createdAt: at(5) });

    await applyConsultationRollup({ type: 'chat', createdAt: at(1) });
    await applyConsultationRollup({ type: 'chat', createdAt: at(2) });
    await applyConsultationRollup({ type: 'voice', createdAt: at(3) });

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
    await applyRevenueRollup({ kind: 'recharge', amount: 999, createdAt: Timestamp.fromMillis(Date.parse('2026-03-16T12:00:00.000Z')) });
    const other = (await db.collection('dailyStats').doc('2026-03-16').get()).data()!;
    expect(other.revenue.recharge).toBe(999);
    // The 15th doc is untouched by the 16th's write.
    const s = (await db.collection('dailyStats').doc(DAY).get()).data()!;
    expect(s.revenue.recharge).toBe(15000);
  });

  it('ignores rows with no kind / non-call consultation types', async () => {
    await applyRevenueRollup({ amount: 100, createdAt: at(6) }); // no kind → skipped
    await applyConsultationRollup({ type: 'unknown', createdAt: at(6) }); // not chat/voice/video
    const s = (await db.collection('dailyStats').doc(DAY).get()).data()!;
    expect(s.revenue.recharge).toBe(15000); // unchanged
    expect(s.consultations.chat).toBe(2);
  });
});
