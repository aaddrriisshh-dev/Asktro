'use client';

import { useEffect, useState } from 'react';
import { formatPaise, shortDay } from '@/lib/format';
import { Range } from '@/lib/dateRange';
import { fetchDailyStats } from '@/lib/dailyStats';
import { DashCard, CardView } from './DashCard';
import { Metric } from './Metric';
import { DailyChart } from './DailyChart';

interface RevData {
  gross: number;
  net: number;
  recharge: number;
  bonus: number;
  consultation: number;
  refunds: number;
  count: number;
  daily: { day: string; value: number }[];
}

/** Reads the wallet ledger for the range and derives all revenue figures. */
function useRevenue(range: Range): CardView<RevData> {
  const [data, setData] = useState<RevData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Read the per-day rollup (≤ one doc per day) instead of scanning the
        // walletTransactions firehose. Rollup stores SIGNED sums per kind, so
        // magnitudes (consultation billing, refunds) use Math.abs.
        const days = await fetchDailyStats(range);
        let recharge = 0, bonus = 0, consultation = 0, refunds = 0, count = 0;
        const daily: { day: string; value: number }[] = [];
        for (const s of days) {
          const rev = s.revenue ?? {};
          recharge += rev.recharge ?? 0;
          bonus += rev.bonus ?? 0;
          consultation += Math.abs(rev.consultation ?? 0);
          refunds += Math.abs(rev.refund ?? 0);
          count += s.counts?.recharge ?? 0;
          daily.push({ day: shortDay(s.day), value: Math.round((rev.recharge ?? 0) / 100) });
        }
        const gross = recharge;
        const net = gross - refunds;
        if (!cancelled) setData({ gross, net, recharge, bonus, consultation, refunds, count, daily });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.start, range.end]);

  return { loading, error, value: formatPaise(data?.gross ?? 0), pill: `${data?.count ?? 0} recharges`, data };
}

const rupeeIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4h11M6 8h11M6 12h5a4 4 0 0 1 0 8H8l7 0M6 12l8 8" />
  </svg>
);

export function RevenueCard() {
  return (
    <DashCard<RevData>
      cardKey="revenue"
      defaultPreset="last30"
      accentClass="c-purple"
      accent="#8b6fd6"
      icon={rupeeIcon}
      title="Total Revenue"
      decor="decor-tr"
      useData={useRevenue}
      renderDrawer={(d) => (
        <>
          <div className="metricgrid">
            <Metric color="c-purple" label="Gross Revenue" value={formatPaise(d.gross)} big />
            <Metric color="c-blue" label="Net Revenue" value={formatPaise(d.net)} big />
            <Metric color="c-green" label="Recharge Revenue" value={formatPaise(d.recharge)} />
            <Metric color="c-amber" label="Consultation billing" value={formatPaise(d.consultation)} />
            <Metric color="c-rose" label="Refunds" value={formatPaise(d.refunds)} />
            <Metric color="c-gold" label="Bonus (free credit)" value={formatPaise(d.bonus)} />
          </div>
          <h3 style={{ margin: '4px 0 10px' }}>Daily breakdown</h3>
          <div className="drawer-chart">
            <DailyChart data={d.daily} color="#8b6fd6" name="Revenue" money />
          </div>
        </>
      )}
    />
  );
}
