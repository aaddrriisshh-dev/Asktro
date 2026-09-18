'use client';

import { useEffect, useState, ReactNode } from 'react';
import Link from 'next/link';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatPaise, formatDate, shortDay } from '@/lib/format';
import { Range } from '@/lib/dateRange';
import { DashCard, CardView } from './DashCard';
import { DrillGrid, DrillColumn } from './DrillDown';
import { DailyChart } from './DailyChart';
import { BarBreakdown } from './BarBreakdown';
import { useAutoRefresh } from '@/lib/autoRefresh';

/** One customer row backing the drill-down lists. */
export interface URow {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  gender?: string;
  accountStatus?: string;
  walletBalance?: number;
  totalRecharge?: number;
  createdAt?: number;
}

/** Shared columns for every customer drill-down list. */
export const USER_COLUMNS: DrillColumn<URow>[] = [
  { header: 'Customer', cell: (u) => (
    <div style={{ minWidth: 0 }}>
      <span className="ovl-nm">{u.name || 'Unnamed'}</span>
      <span className="ovl-ph">{u.phone || u.id.slice(0, 12)}</span>
    </div>
  ) },
  { header: 'Email', cell: (u) => u.email
    ? <span className="ovl-em">{u.email}</span>
    : <span className="muted">—</span> },
  { header: 'Wallet', align: 'right', cell: (u) => formatPaise(u.walletBalance) },
  { header: 'Recharged', align: 'right', cell: (u) => formatPaise(u.totalRecharge) },
  { header: 'Joined', cell: (u) => formatDate(u.createdAt) },
  { header: '', align: 'right', cell: (u) => <Link href={`/users/${u.id}`} className="btn sm secondary">View</Link> },
];

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
  unpaidWithPhone: number;
  unpaidBlocked: number;
  dailyPaid: { day: string; value: number }[];
  dailyUnpaid: { day: string; value: number }[];
  // Real record lists behind each number (for in-place drill-downs).
  rowsAll: URow[];
  rowsPaid: URow[];
  rowsUnpaid: URow[];
  rowsPaidMale: URow[];
  rowsPaidFemale: URow[];
  rowsUnpaidEmail: URow[];
  rowsUnpaidPhone: URow[];
  rowsUnpaidBlocked: URow[];
}

function useUsersMonetisation(range: Range): CardView<PayData> {
  const [data, setData] = useState<PayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tick = useAutoRefresh();

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
        let rechargeSum = 0;
        const byDayPaid = new Map<string, number>();
        const byDayUnpaid = new Map<string, number>();
        const rowsAll: URow[] = [], rowsPaid: URow[] = [], rowsUnpaid: URow[] = [];
        const rowsPaidMale: URow[] = [], rowsPaidFemale: URow[] = [];
        const rowsUnpaidEmail: URow[] = [], rowsUnpaidPhone: URow[] = [], rowsUnpaidBlocked: URow[] = [];
        snap.forEach((doc) => {
          const u = doc.data() as {
            name?: string; phone?: string; gender?: string; email?: string; accountStatus?: string;
            walletBalance?: number; totalRecharge?: number; createdAt?: Timestamp;
          };
          const ms = u.createdAt?.toMillis?.() ?? range.start;
          const row: URow = {
            id: doc.id, name: u.name, phone: u.phone, email: u.email, gender: u.gender,
            accountStatus: u.accountStatus, walletBalance: u.walletBalance, totalRecharge: u.totalRecharge, createdAt: ms,
          };
          rowsAll.push(row);
          const isPaid = (u.totalRecharge ?? 0) > 0;
          const key = new Date(ms).toISOString().slice(0, 10);
          if (isPaid) {
            rechargeSum += u.totalRecharge ?? 0;
            rowsPaid.push(row);
            if (u.gender === 'male') rowsPaidMale.push(row);
            else if (u.gender === 'female') rowsPaidFemale.push(row);
            byDayPaid.set(key, (byDayPaid.get(key) ?? 0) + 1);
          } else {
            rowsUnpaid.push(row);
            if (u.email) rowsUnpaidEmail.push(row);
            if (u.phone) rowsUnpaidPhone.push(row);
            if (u.accountStatus === 'blocked') rowsUnpaidBlocked.push(row);
            byDayUnpaid.set(key, (byDayUnpaid.get(key) ?? 0) + 1);
          }
        });
        const total = snap.size;
        const paid = rowsPaid.length;
        const unpaid = total - paid;
        const toDaily = (m: Map<string, number>) => [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day: shortDay(day), value }));
        if (!cancelled) setData({
          total, paid, unpaid,
          paidPct: total ? Math.round((paid / total) * 100) : 0,
          unpaidPct: total ? Math.round((unpaid / total) * 100) : 0,
          totalRecharge: rechargeSum, avgPerPaid: paid ? Math.round(rechargeSum / paid) : 0,
          paidMale: rowsPaidMale.length, paidFemale: rowsPaidFemale.length,
          unpaidWithEmail: rowsUnpaidEmail.length, unpaidWithPhone: rowsUnpaidPhone.length,
          unpaidBlocked: rowsUnpaidBlocked.length,
          dailyPaid: toDaily(byDayPaid), dailyUnpaid: toDaily(byDayUnpaid),
          rowsAll, rowsPaid, rowsUnpaid, rowsPaidMale, rowsPaidFemale,
          rowsUnpaidEmail, rowsUnpaidPhone, rowsUnpaidBlocked,
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.start, range.end, tick]);

  return { loading, error, value: '', data };
}

const walletIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z" />
  </svg>
);

const inr = (n: number) => n.toLocaleString('en-IN');

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
      renderDrawer={(d, range) => {
        const sub = `${range.label} · India time`;
        return (
          <>
            <DrillGrid<URow> tiles={[
              { color: 'c-rose', label: 'Paid users', value: inr(d.paid), big: true,
                drill: { title: 'Paid customers', subtitle: sub, rows: d.rowsPaid, columns: USER_COLUMNS, emptyNote: 'No paid customers in this period.' } },
              { color: 'c-green', label: 'Total recharged', value: formatPaise(d.totalRecharge), big: true },
              { color: 'c-blue', label: '% of registered', value: `${d.paidPct}%` },
              { color: 'c-gold', label: 'Avg / paid user', value: formatPaise(d.avgPerPaid) },
              { color: 'c-purple', label: 'Male', value: inr(d.paidMale),
                drill: { title: 'Paid male customers', subtitle: sub, rows: d.rowsPaidMale, columns: USER_COLUMNS, emptyNote: 'None here.' } },
              { color: 'c-amber', label: 'Female', value: inr(d.paidFemale),
                drill: { title: 'Paid female customers', subtitle: sub, rows: d.rowsPaidFemale, columns: USER_COLUMNS, emptyNote: 'None here.' } },
            ]} />
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
        );
      }}
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
      renderDrawer={(d, range) => {
        const sub = `${range.label} · India time`;
        return (
          <>
            <DrillGrid<URow> tiles={[
              { color: 'c-slate', label: 'Unpaid users', value: inr(d.unpaid), big: true,
                drill: { title: 'Unpaid customers', subtitle: sub, rows: d.rowsUnpaid, columns: USER_COLUMNS, emptyNote: 'No unpaid customers in this period.' } },
              { color: 'c-rose', label: 'Paid users', value: inr(d.paid), big: true,
                drill: { title: 'Paid customers', subtitle: sub, rows: d.rowsPaid, columns: USER_COLUMNS, emptyNote: 'No paid customers in this period.' } },
              { color: 'c-blue', label: '% of registered', value: `${d.unpaidPct}%` },
              { color: 'c-green', label: 'Reachable (email)', value: inr(d.unpaidWithEmail),
                drill: { title: 'Unpaid · reachable by email', subtitle: sub, rows: d.rowsUnpaidEmail, columns: USER_COLUMNS, emptyNote: 'None have an email on file.' } },
              { color: 'c-amber', label: 'Reachable (phone)', value: inr(d.unpaidWithPhone),
                drill: { title: 'Unpaid · reachable by phone', subtitle: sub, rows: d.rowsUnpaidPhone, columns: USER_COLUMNS, emptyNote: 'None have a phone on file.' } },
              { color: 'c-red', label: 'Blocked', value: inr(d.unpaidBlocked),
                drill: { title: 'Blocked unpaid customers', subtitle: sub, rows: d.rowsUnpaidBlocked, columns: USER_COLUMNS, emptyNote: 'None blocked.' } },
              { color: 'c-gold', label: 'Registered', value: inr(d.total),
                drill: { title: 'All registered customers', subtitle: sub, rows: d.rowsAll, columns: USER_COLUMNS, emptyNote: 'None in this period.' } },
            ]} />
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
        );
      }}
    />
  );
}
