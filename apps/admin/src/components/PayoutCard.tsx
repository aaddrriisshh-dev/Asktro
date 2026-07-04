'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatPaise } from '@/lib/format';
import { Range } from '@/lib/dateRange';
import { DashCard, CardView } from './DashCard';
import { Metric } from './Metric';
import { DailyChart } from './DailyChart';

interface PayoutData {
  pendingAmount: number;
  pendingCount: number;
  approvedAmount: number;
  approvedCount: number;
  totalAmount: number;
  count: number;
  avg: number;
  daily: { day: string; value: number }[];
}

function usePayouts(range: Range): CardView<PayoutData> {
  const [data, setData] = useState<PayoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'payouts'),
          where('createdAt', '>=', Timestamp.fromMillis(range.start)),
          where('createdAt', '<', Timestamp.fromMillis(range.end)),
          orderBy('createdAt', 'asc'),
        ));
        let pendingAmount = 0, pendingCount = 0, approvedAmount = 0, approvedCount = 0, totalAmount = 0;
        const byDay = new Map<string, number>();
        snap.forEach((doc) => {
          const p = doc.data() as { amount?: number; status?: string; createdAt?: Timestamp };
          const amt = p.amount ?? 0;
          totalAmount += amt;
          if (p.status === 'pending') { pendingAmount += amt; pendingCount += 1; }
          else if (p.status === 'approved') { approvedAmount += amt; approvedCount += 1; }
          const ms = p.createdAt?.toMillis?.() ?? range.start;
          const key = new Date(ms).toISOString().slice(0, 10);
          byDay.set(key, (byDay.get(key) ?? 0) + Math.round(amt / 100));
        });
        const daily = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day: day.slice(5), value }));
        if (!cancelled) setData({
          pendingAmount, pendingCount, approvedAmount, approvedCount, totalAmount,
          count: snap.size, avg: snap.size ? Math.round(totalAmount / snap.size) : 0, daily,
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.start, range.end]);

  return { loading, error, value: formatPaise(data?.pendingAmount ?? 0), pill: data ? `${data.pendingCount} pending` : undefined, data };
}

const payoutIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

export function PayoutCard() {
  return (
    <DashCard<PayoutData>
      cardKey="payouts"
      defaultPreset="allTime"
      accentClass="c-bronze"
      accent="#b8862a"
      icon={payoutIcon}
      title="Astrologers Payout"
      decor="decor-tl"
      useData={usePayouts}
      renderDrawer={(d) => (
        <>
          <div className="metricgrid">
            <Metric color="c-bronze" label="Pending payout" value={formatPaise(d.pendingAmount)} big />
            <Metric color="c-green" label="Approved payout" value={formatPaise(d.approvedAmount)} big />
            <Metric color="c-amber" label="Pending requests" value={d.pendingCount.toLocaleString('en-IN')} />
            <Metric color="c-blue" label="Approved requests" value={d.approvedCount.toLocaleString('en-IN')} />
            <Metric color="c-purple" label="Total requested" value={formatPaise(d.totalAmount)} />
            <Metric color="c-gold" label="Avg payout" value={formatPaise(d.avg)} />
          </div>
          <h3 style={{ margin: '4px 0 10px' }}>Payout requests per day</h3>
          <div className="drawer-chart">
            <DailyChart data={d.daily} color="#b8862a" name="Payout" money />
          </div>
        </>
      )}
    />
  );
}
