'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { shortDay } from '@/lib/format';
import { Range } from '@/lib/dateRange';
import { fetchDailyStats } from '@/lib/dailyStats';
import { DashCard, CardView } from './DashCard';
import { DrillGrid } from './DrillDown';
import { URow, USER_COLUMNS } from './PaidUnpaidCards';
import { DailyChart } from './DailyChart';
import { useAutoRefresh } from '@/lib/autoRefresh';

interface UsersData {
  total: number;
  male: number;
  female: number;
  withEmail: number;
  blocked: number;
  paid: number;
  daily: { day: string; value: number }[];
  rowsAll: URow[];
  rowsPaid: URow[];
  rowsMale: URow[];
  rowsFemale: URow[];
  rowsWithEmail: URow[];
  rowsBlocked: URow[];
}

function useRegisteredUsers(range: Range): CardView<UsersData> {
  const [data, setData] = useState<UsersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tick = useAutoRefresh();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Every headline/drawer number is scoped to the SELECTED PERIOD (users
        // whose createdAt falls in range), so Today / Yesterday / Last 7 Days each
        // show their own real figure instead of the same all-time total. "All
        // Time" (range.start = 0) naturally becomes the grand total. Counts are
        // derived from the same capped fetch that backs the drill-down lists, so
        // the headline and the drilled list always agree. Capped so the browser
        // can never OOM; beyond the cap it samples the most recent (a rollup-backed
        // exact count is the 10k→50k refinement). Astrologers aren't in `users`.
        const usersCol = collection(db, 'users');
        const ROW_CAP = 5000;
        const [days, rowsSnap] = await Promise.all([
          fetchDailyStats(range),
          getDocs(query(usersCol,
            where('createdAt', '>=', Timestamp.fromMillis(range.start)),
            where('createdAt', '<', Timestamp.fromMillis(range.end)),
            orderBy('createdAt', 'desc'), limit(ROW_CAP))),
        ]);
        const daily = days.map((s) => ({ day: shortDay(s.day), value: s.signups?.total ?? 0 }));
        const rowsAll: URow[] = [], rowsPaid: URow[] = [], rowsMale: URow[] = [], rowsFemale: URow[] = [];
        const rowsWithEmail: URow[] = [], rowsBlocked: URow[] = [];
        rowsSnap.forEach((doc) => {
          const u = doc.data() as {
            name?: string; phone?: string; email?: string; gender?: string; accountStatus?: string;
            walletBalance?: number; totalRecharge?: number; createdAt?: Timestamp;
          };
          const row: URow = {
            id: doc.id, name: u.name, phone: u.phone, email: u.email, gender: u.gender,
            accountStatus: u.accountStatus, walletBalance: u.walletBalance, totalRecharge: u.totalRecharge,
            createdAt: u.createdAt?.toMillis?.() ?? range.start,
          };
          rowsAll.push(row);
          if ((u.totalRecharge ?? 0) > 0) rowsPaid.push(row);
          if (u.gender === 'male') rowsMale.push(row);
          else if (u.gender === 'female') rowsFemale.push(row);
          if (u.email) rowsWithEmail.push(row);
          if (u.accountStatus === 'blocked') rowsBlocked.push(row);
        });
        if (!cancelled) setData({
          total: rowsAll.length,
          male: rowsMale.length,
          female: rowsFemale.length,
          withEmail: rowsWithEmail.length,
          blocked: rowsBlocked.length,
          paid: rowsPaid.length,
          daily,
          rowsAll, rowsPaid, rowsMale, rowsFemale, rowsWithEmail, rowsBlocked,
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.start, range.end, tick]);

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
      renderDrawer={(d, range) => {
        const sub = `${range.label} · India time`;
        return (
        <>
          <DrillGrid<URow> tiles={[
            { color: 'c-blue', label: 'Registered', value: d.total.toLocaleString('en-IN'), big: true,
              drill: { title: 'All registered customers', subtitle: sub, rows: d.rowsAll, columns: USER_COLUMNS, emptyNote: 'None in this period.' } },
            { color: 'c-green', label: 'Paid', value: d.paid.toLocaleString('en-IN'), big: true,
              drill: { title: 'Paid customers', subtitle: sub, rows: d.rowsPaid, columns: USER_COLUMNS, emptyNote: 'No paid customers in this period.' } },
            { color: 'c-purple', label: 'Male', value: d.male.toLocaleString('en-IN'),
              drill: { title: 'Male customers', subtitle: sub, rows: d.rowsMale, columns: USER_COLUMNS, emptyNote: 'None here.' } },
            { color: 'c-rose', label: 'Female', value: d.female.toLocaleString('en-IN'),
              drill: { title: 'Female customers', subtitle: sub, rows: d.rowsFemale, columns: USER_COLUMNS, emptyNote: 'None here.' } },
            { color: 'c-amber', label: 'With email', value: d.withEmail.toLocaleString('en-IN'),
              drill: { title: 'Customers with an email', subtitle: sub, rows: d.rowsWithEmail, columns: USER_COLUMNS, emptyNote: 'None here.' } },
            { color: 'c-red', label: 'Blocked', value: d.blocked.toLocaleString('en-IN'),
              drill: { title: 'Blocked customers', subtitle: sub, rows: d.rowsBlocked, columns: USER_COLUMNS, emptyNote: 'None blocked.' } },
          ]} />
          <h3 style={{ margin: '4px 0 10px' }}>Daily sign-ups</h3>
          <div className="drawer-chart">
            <DailyChart data={d.daily} color="#3b6fd4" name="Sign-ups" />
          </div>
        </>
        );
      }}
    />
  );
}
