'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatPaise, shortDay } from '@/lib/format';
import { Range } from '@/lib/dateRange';
import { DashCard, CardView } from './DashCard';
import { DrillGrid } from './DrillDown';
import { URow, USER_COLUMNS } from './PaidUnpaidCards';
import { DailyChart } from './DailyChart';
import { useAutoRefresh } from '@/lib/autoRefresh';
import { isRealCustomer } from '@/lib/customer';

interface ConvData {
  registered: number;
  converted: number;
  rate: number; // 0..100
  unpaid: number;
  sameDay: number;
  avgRecharge: number; // paise, across converted
  daily: { day: string; value: number }[];
  rowsAll: URow[];
  rowsConverted: URow[];
  rowsUnpaid: URow[];
  rowsSameDay: URow[];
}

const DAY = 86_400_000;

function useConversion(range: Range): CardView<ConvData> {
  const [data, setData] = useState<ConvData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tick = useAutoRefresh();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Detailed per-user conversion analytics need per-doc reads. Hard-capped
        // to the most recent CONV_CAP users in range so the browser can never OOM
        // (the crash the audit flagged). Beyond the cap the card samples the most
        // recent users; a rollup-backed exact version is the 10k→50k refinement.
        const CONV_CAP = 5000;
        const snap = await getDocs(query(
          collection(db, 'users'),
          where('createdAt', '>=', Timestamp.fromMillis(range.start)),
          where('createdAt', '<', Timestamp.fromMillis(range.end)),
          orderBy('createdAt', 'desc'),
          limit(CONV_CAP),
        ));
        let converted = 0, sameDay = 0, rechargeSum = 0;
        const byDay = new Map<string, number>();
        const rowsAll: URow[] = [], rowsConverted: URow[] = [], rowsUnpaid: URow[] = [], rowsSameDay: URow[] = [];
        snap.forEach((doc) => {
          const u = doc.data() as {
            name?: string; phone?: string; email?: string; gender?: string; accountStatus?: string;
            walletBalance?: number; createdAt?: Timestamp; firstRechargeAt?: Timestamp | null; totalRecharge?: number; isTestAccount?: boolean;
          };
          if (!isRealCustomer(u)) return; // exclude deleted + test accounts
          const created = u.createdAt?.toMillis?.() ?? range.start;
          const row: URow = {
            id: doc.id, name: u.name, phone: u.phone, email: u.email, gender: u.gender,
            accountStatus: u.accountStatus, walletBalance: u.walletBalance, totalRecharge: u.totalRecharge, createdAt: created,
          };
          rowsAll.push(row);
          const first = u.firstRechargeAt?.toMillis?.() ?? null;
          if (first) {
            converted += 1;
            rechargeSum += u.totalRecharge ?? 0;
            rowsConverted.push(row);
            if (first - created <= DAY) { sameDay += 1; rowsSameDay.push(row); }
            const key = new Date(first).toISOString().slice(0, 10);
            byDay.set(key, (byDay.get(key) ?? 0) + 1);
          } else {
            rowsUnpaid.push(row);
          }
        });
        // rowsAll holds only REAL customers (deleted + test skipped above); use
        // its length, not snap.size (raw), so the conversion base matches the
        // Registered Users card.
        const registered = rowsAll.length;
        const rate = registered ? Math.round((converted / registered) * 100) : 0;
        const daily = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day: shortDay(day), value }));
        if (!cancelled) setData({
          registered, converted, rate, unpaid: registered - converted, sameDay,
          avgRecharge: converted ? Math.round(rechargeSum / converted) : 0, daily,
          rowsAll, rowsConverted, rowsUnpaid, rowsSameDay,
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.start, range.end, tick]);

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
      renderDrawer={(d, range) => {
        const sub = `${range.label} · India time`;
        return (
        <>
          <DrillGrid<URow> tiles={[
            { color: 'c-amber', label: 'Conversion rate', value: `${d.rate}%`, big: true },
            { color: 'c-green', label: 'Converted', value: d.converted.toLocaleString('en-IN'), big: true,
              drill: { title: 'Converted customers (first recharge)', subtitle: sub, rows: d.rowsConverted, columns: USER_COLUMNS, emptyNote: 'None converted in this period.' } },
            { color: 'c-blue', label: 'Registered', value: d.registered.toLocaleString('en-IN'),
              drill: { title: 'All registered customers', subtitle: sub, rows: d.rowsAll, columns: USER_COLUMNS, emptyNote: 'None in this period.' } },
            { color: 'c-red', label: 'Still unpaid', value: d.unpaid.toLocaleString('en-IN'),
              drill: { title: 'Registered but never recharged', subtitle: sub, rows: d.rowsUnpaid, columns: USER_COLUMNS, emptyNote: 'None here.' } },
            { color: 'c-purple', label: 'Same-day converts', value: d.sameDay.toLocaleString('en-IN'),
              drill: { title: 'Converted within a day of signup', subtitle: sub, rows: d.rowsSameDay, columns: USER_COLUMNS, emptyNote: 'None here.' } },
            { color: 'c-gold', label: 'Avg recharge / convert', value: formatPaise(d.avgRecharge) },
          ]} />
          <h3 style={{ margin: '4px 0 10px' }}>First recharges per day</h3>
          <div className="drawer-chart">
            <DailyChart data={d.daily} color="#d98a1f" name="Conversions" />
          </div>
        </>
        );
      }}
    />
  );
}
