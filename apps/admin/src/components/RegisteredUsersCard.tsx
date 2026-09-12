'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { shortDay } from '@/lib/format';
import { Range } from '@/lib/dateRange';
import { fetchDailyStats } from '@/lib/dailyStats';
import { DashCard, CardView } from './DashCard';
import { Metric } from './Metric';
import { DailyChart } from './DailyChart';

interface UsersData {
  total: number;
  male: number;
  female: number;
  withEmail: number;
  blocked: number;
  paid: number;
  daily: { day: string; value: number }[];
}

function useRegisteredUsers(range: Range): CardView<UsersData> {
  const [data, setData] = useState<UsersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Total, gender split, paid and blocked are server-side COUNT
        // aggregations over the LIVE `users` collection — accurate and current,
        // and no docs are downloaded to the browser. Gender is counted straight
        // from each user's record (NOT the old per-day signup rollup, which only
        // recorded gender at account-creation time — before the setup screen
        // saved it — so male+female came out far below the real split). The
        // daily histogram + withEmail still come from the rollup (a time-series,
        // one small doc per day).
        const usersCol = collection(db, 'users');
        const [days, totalAgg, maleAgg, femaleAgg, paidAgg, blockedAgg] = await Promise.all([
          fetchDailyStats(range),
          getCountFromServer(usersCol),
          getCountFromServer(query(usersCol, where('gender', '==', 'male'))),
          getCountFromServer(query(usersCol, where('gender', '==', 'female'))),
          getCountFromServer(query(usersCol, where('totalRecharge', '>', 0))),
          getCountFromServer(query(usersCol, where('accountStatus', '==', 'blocked'))),
        ]);
        let withEmail = 0;
        const daily = days.map((s) => {
          withEmail += s.signups?.withEmail ?? 0;
          return { day: shortDay(s.day), value: s.signups?.total ?? 0 };
        });
        if (!cancelled) setData({
          total: totalAgg.data().count,
          male: maleAgg.data().count,
          female: femaleAgg.data().count,
          withEmail,
          blocked: blockedAgg.data().count,
          paid: paidAgg.data().count,
          daily,
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.start, range.end]);

  return {
    loading,
    error,
    value: (data?.total ?? 0).toLocaleString('en-IN'),
    pill: data ? `${data.male} ♂ · ${data.female} ♀` : undefined,
    data,
  };
}

const usersIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export function RegisteredUsersCard() {
  return (
    <DashCard<UsersData>
      cardKey="users"
      defaultPreset="allTime"
      accentClass="c-blue"
      accent="#3b6fd4"
      icon={usersIcon}
      title="Registered Users"
      decor="decor-tl"
      useData={useRegisteredUsers}
      renderDrawer={(d) => (
        <>
          <div className="metricgrid">
            <Metric color="c-blue" label="Registered" value={d.total.toLocaleString('en-IN')} big />
            <Metric color="c-green" label="Paid" value={d.paid.toLocaleString('en-IN')} big />
            <Metric color="c-purple" label="Male" value={d.male.toLocaleString('en-IN')} />
            <Metric color="c-rose" label="Female" value={d.female.toLocaleString('en-IN')} />
            <Metric color="c-amber" label="With email" value={d.withEmail.toLocaleString('en-IN')} />
            <Metric color="c-red" label="Blocked" value={d.blocked.toLocaleString('en-IN')} />
          </div>
          <h3 style={{ margin: '4px 0 10px' }}>Daily sign-ups</h3>
          <div className="drawer-chart">
            <DailyChart data={d.daily} color="#3b6fd4" name="Sign-ups" />
          </div>
        </>
      )}
    />
  );
}
