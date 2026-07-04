'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatPaise, shortDay } from '@/lib/format';
import { Range } from '@/lib/dateRange';
import { DashCard, CardView } from './DashCard';
import { Metric } from './Metric';
import { DailyChart } from './DailyChart';

interface ConvData {
  registered: number;
  converted: number;
  rate: number; // 0..100
  unpaid: number;
  sameDay: number;
  avgRecharge: number; // paise, across converted
  daily: { day: string; value: number }[];
}

const DAY = 86_400_000;

function useConversion(range: Range): CardView<ConvData> {
  const [data, setData] = useState<ConvData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'users'),
          where('createdAt', '>=', Timestamp.fromMillis(range.start)),
          where('createdAt', '<', Timestamp.fromMillis(range.end)),
          orderBy('createdAt', 'asc'),
        ));
        let converted = 0, sameDay = 0, rechargeSum = 0;
        const byDay = new Map<string, number>();
        snap.forEach((doc) => {
          const u = doc.data() as { createdAt?: Timestamp; firstRechargeAt?: Timestamp | null; totalRecharge?: number };
          const first = u.firstRechargeAt?.toMillis?.() ?? null;
          if (first) {
            converted += 1;
            rechargeSum += u.totalRecharge ?? 0;
            const created = u.createdAt?.toMillis?.() ?? first;
            if (first - created <= DAY) sameDay += 1;
            const key = new Date(first).toISOString().slice(0, 10);
            byDay.set(key, (byDay.get(key) ?? 0) + 1);
          }
        });
        const registered = snap.size;
        const rate = registered ? Math.round((converted / registered) * 100) : 0;
        const daily = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day: shortDay(day), value }));
        if (!cancelled) setData({
          registered, converted, rate, unpaid: registered - converted, sameDay,
          avgRecharge: converted ? Math.round(rechargeSum / converted) : 0, daily,
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.start, range.end]);

  return { loading, error, value: `${data?.rate ?? 0}%`, pill: data ? `${data.converted}/${data.registered}` : undefined, data };
}

const convIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 6l-9.5 9.5-5-5L1 18M17 6h6v6" />
  </svg>
);

export function ConversionCard() {
  return (
    <DashCard<ConvData>
      cardKey="fr1"
      defaultPreset="last30"
      accentClass="c-amber"
      accent="#d98a1f"
      icon={convIcon}
      title="First Recharge Conversion"
      decor="decor-bl"
      useData={useConversion}
      renderDrawer={(d) => (
        <>
          <div className="metricgrid">
            <Metric color="c-amber" label="Conversion rate" value={`${d.rate}%`} big />
            <Metric color="c-green" label="Converted" value={d.converted.toLocaleString('en-IN')} big />
            <Metric color="c-blue" label="Registered" value={d.registered.toLocaleString('en-IN')} />
            <Metric color="c-red" label="Still unpaid" value={d.unpaid.toLocaleString('en-IN')} />
            <Metric color="c-purple" label="Same-day converts" value={d.sameDay.toLocaleString('en-IN')} />
            <Metric color="c-gold" label="Avg recharge / convert" value={formatPaise(d.avgRecharge)} />
          </div>
          <h3 style={{ margin: '4px 0 10px' }}>First recharges per day</h3>
          <div className="drawer-chart">
            <DailyChart data={d.daily} color="#d98a1f" name="Conversions" />
          </div>
        </>
      )}
    />
  );
}
