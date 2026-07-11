'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatPaise, shortDay } from '@/lib/format';
import { Range } from '@/lib/dateRange';
import { DashCard, CardView } from './DashCard';
import { Metric } from './Metric';
import { DailyChart } from './DailyChart';
import { BarBreakdown } from './BarBreakdown';

interface PayData {
  total: number;
  paid: number;
  unpaid: number;
  paidPct: number;
  unpaidPct: number;
  totalRecharge: number; // paise
  avgPerPaid: number; // paise
  paidMale: number;
  paidFemale: number;
  unpaidWithEmail: number;
  unpaidBlocked: number;
  dailyPaid: { day: string; value: number }[];
  dailyUnpaid: { day: string; value: number }[];
}

function useUsersMonetisation(range: Range): CardView<PayData> {
  const [data, setData] = useState<PayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Hard-capped to the most recent users in range so the browser can never
        // OOM at scale (the audit's dashboard-crash finding). Beyond the cap the
        // breakdown samples recent users; exact rollup-backed version is a
        // 10k→50k refinement.
        const PU_CAP = 5000;
        const snap = await getDocs(query(
          collection(db, 'users'),
          where('createdAt', '>=', Timestamp.fromMillis(range.start)),
          where('createdAt', '<', Timestamp.fromMillis(range.end)),
          orderBy('createdAt', 'desc'),
          limit(PU_CAP),
        ));
        let paid = 0, rechargeSum = 0, paidMale = 0, paidFemale = 0, unpaidWithEmail = 0, unpaidBlocked = 0;
        const byDayPaid = new Map<string, number>();
        const byDayUnpaid = new Map<string, number>();
        snap.forEach((doc) => {
          const u = doc.data() as { gender?: string; email?: string; accountStatus?: string; totalRecharge?: number; createdAt?: Timestamp };
          const isPaid = (u.totalRecharge ?? 0) > 0;
          const ms = u.createdAt?.toMillis?.() ?? range.start;
          const key = new Date(ms).toISOString().slice(0, 10);
          if (isPaid) {
            paid += 1;
            rechargeSum += u.totalRecharge ?? 0;
            if (u.gender === 'male') paidMale += 1;
            else if (u.gender === 'female') paidFemale += 1;
            byDayPaid.set(key, (byDayPaid.get(key) ?? 0) + 1);
          } else {
            if (u.email) unpaidWithEmail += 1;
            if (u.accountStatus === 'blocked') unpaidBlocked += 1;
            byDayUnpaid.set(key, (byDayUnpaid.get(key) ?? 0) + 1);
          }
        });
        const total = snap.size;
        const unpaid = total - paid;
        const toDaily = (m: Map<string, number>) => [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day: shortDay(day), value }));
        if (!cancelled) setData({
          total, paid, unpaid,
          paidPct: total ? Math.round((paid / total) * 100) : 0,
          unpaidPct: total ? Math.round((unpaid / total) * 100) : 0,
          totalRecharge: rechargeSum, avgPerPaid: paid ? Math.round(rechargeSum / paid) : 0,
          paidMale, paidFemale, unpaidWithEmail, unpaidBlocked,
          dailyPaid: toDaily(byDayPaid), dailyUnpaid: toDaily(byDayUnpaid),
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.start, range.end]);

  return { loading, error, value: '', data };
}

const walletIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z" />
  </svg>
);

// ---- Card 7: Paid users ---------------------------------------------------
export function PaidUsersCard() {
  return (
    <DashCard<PayData>
      cardKey="paid_users"
      defaultPreset="allTime"
      accentClass="c-rose"
      accent="#d0567e"
      icon={walletIcon}
      title="Paid Users"
      decor="decor-br"
      useData={(range) => {
        const v = useUsersMonetisation(range);
        return { ...v, value: (v.data?.paid ?? 0).toLocaleString('en-IN'), pill: v.data ? `${v.data.paidPct}% of users` : undefined };
      }}
      renderDrawer={(d) => (
        <>
          <div className="metricgrid">
            <Metric color="c-rose" label="Paid users" value={d.paid.toLocaleString('en-IN')} big />
            <Metric color="c-green" label="Total recharged" value={formatPaise(d.totalRecharge)} big />
            <Metric color="c-blue" label="% of registered" value={`${d.paidPct}%`} />
            <Metric color="c-gold" label="Avg / paid user" value={formatPaise(d.avgPerPaid)} />
            <Metric color="c-purple" label="Male" value={d.paidMale.toLocaleString('en-IN')} />
            <Metric color="c-amber" label="Female" value={d.paidFemale.toLocaleString('en-IN')} />
          </div>
          <h3 style={{ margin: '4px 0 12px' }}>Paid vs unpaid</h3>
          <BarBreakdown segments={[
            { label: 'Paid', value: d.paid, color: '#d0567e' },
            { label: 'Unpaid', value: d.unpaid, color: '#c9c4e0' },
          ]} />
          <h3 style={{ margin: '18px 0 10px' }}>New paying users per day</h3>
          <div className="drawer-chart">
            <DailyChart data={d.dailyPaid} color="#d0567e" name="Paid sign-ups" />
          </div>
        </>
      )}
    />
  );
}

// ---- Card 8: Unpaid users -------------------------------------------------
export function UnpaidUsersCard() {
  return (
    <DashCard<PayData>
      cardKey="unpaid_users"
      defaultPreset="allTime"
      accentClass="c-slate"
      accent="#64748b"
      icon={walletIcon}
      title="Unpaid Users"
      decor="decor-bl"
      useData={(range) => {
        const v = useUsersMonetisation(range);
        return { ...v, value: (v.data?.unpaid ?? 0).toLocaleString('en-IN'), pill: v.data ? `${v.data.unpaidPct}% of users` : undefined };
      }}
      renderDrawer={(d) => (
        <>
          <div className="metricgrid">
            <Metric color="c-slate" label="Unpaid users" value={d.unpaid.toLocaleString('en-IN')} big />
            <Metric color="c-rose" label="Paid users" value={d.paid.toLocaleString('en-IN')} big />
            <Metric color="c-blue" label="% of registered" value={`${d.unpaidPct}%`} />
            <Metric color="c-green" label="Reachable (email)" value={d.unpaidWithEmail.toLocaleString('en-IN')} />
            <Metric color="c-red" label="Blocked" value={d.unpaidBlocked.toLocaleString('en-IN')} />
            <Metric color="c-gold" label="Registered" value={d.total.toLocaleString('en-IN')} />
          </div>
          <h3 style={{ margin: '4px 0 12px' }}>Unpaid vs paid</h3>
          <BarBreakdown segments={[
            { label: 'Unpaid', value: d.unpaid, color: '#64748b' },
            { label: 'Paid', value: d.paid, color: '#cbb6d8' },
          ]} />
          <h3 style={{ margin: '18px 0 10px' }}>New unpaid users per day</h3>
          <div className="drawer-chart">
            <DailyChart data={d.dailyUnpaid} color="#64748b" name="Unpaid sign-ups" />
          </div>
        </>
      )}
    />
  );
}
