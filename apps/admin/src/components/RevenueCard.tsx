'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { db } from '@/lib/firebase';
import { formatPaise } from '@/lib/format';
import { useCardFilter } from '@/lib/useCardFilter';
import { Range } from '@/lib/dateRange';
import { DateFilter } from './DateFilter';
import { Drawer } from './Drawer';

interface RevData {
  gross: number;
  net: number;
  recharge: number;
  bonus: number;
  consultation: number;
  refunds: number;
  count: number;
  daily: { day: string; amount: number }[];
}

/** Reads the wallet ledger for the range and derives all revenue figures. */
function useRevenue(range: Range) {
  const [data, setData] = useState<RevData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const q = query(
          collection(db, 'walletTransactions'),
          where('createdAt', '>=', Timestamp.fromMillis(range.start)),
          where('createdAt', '<', Timestamp.fromMillis(range.end)),
          orderBy('createdAt', 'asc'),
        );
        const snap = await getDocs(q);
        let recharge = 0, bonus = 0, consultation = 0, refunds = 0, count = 0;
        const byDay = new Map<string, number>();
        snap.forEach((d) => {
          const t = d.data() as { kind?: string; amount?: number; createdAt?: Timestamp };
          const amt = t.amount ?? 0;
          if (t.kind === 'recharge') {
            recharge += amt;
            count += 1;
            const ms = t.createdAt?.toMillis?.() ?? range.start;
            const key = new Date(ms).toISOString().slice(0, 10);
            byDay.set(key, (byDay.get(key) ?? 0) + amt);
          } else if (t.kind === 'bonus') bonus += amt;
          else if (t.kind === 'consultation') consultation += Math.abs(amt);
          else if (t.kind === 'refund') refunds += Math.abs(amt);
        });
        const gross = recharge;
        const net = gross - refunds;
        const daily = [...byDay.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, amount]) => ({ day: day.slice(5), amount: Math.round(amount / 100) }));
        if (!cancelled) setData({ gross, net, recharge, bonus, consultation, refunds, count, daily });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end]);

  return { data, loading, error };
}

const rupeeIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4h11M6 8h11M6 12h5a4 4 0 0 1 0 8H8l7 0M6 12l8 8" />
  </svg>
);

const expandIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);

function Metric({ color, label, value, big }: { color: string; label: string; value: string; big?: boolean }) {
  return (
    <div className={`metricchip ${color}${big ? ' big' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function RevenueCard() {
  const { preset, setPreset, custom, setCustom, range } = useCardFilter('revenue', 'last30');
  const { data, loading, error } = useRevenue(range);
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="stat dashcard c-green">
        <div className="stat__label">
          <span className="stat__icon">{rupeeIcon}</span>
          Total Revenue
          <DateFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} />
        </div>
        {error ? (
          <div className="dashcard__err">Couldn’t load</div>
        ) : loading ? (
          <div className="dashcard__skel" />
        ) : (
          <div className="stat__value">{formatPaise(data?.gross ?? 0)}</div>
        )}
        <div className="stat__foot">
          {!loading && !error && <span className="stat__pill green">{data?.count ?? 0} recharges</span>}
          <button className="dashcard__view" onClick={() => setOpen(true)}>
            View details {expandIcon}
          </button>
        </div>
      </div>

      <Drawer open={open} onClose={() => setOpen(false)} title="Total Revenue" subtitle={range.label} accent="#2f9c63">
        {error ? (
          <p className="dashcard__err">Couldn’t load revenue — {error}</p>
        ) : loading || !data ? (
          <div className="dashcard__skel" style={{ height: 200 }} />
        ) : (
          <>
            <div className="metricgrid">
              <Metric color="c-green" label="Gross Revenue" value={formatPaise(data.gross)} big />
              <Metric color="c-blue" label="Net Revenue" value={formatPaise(data.net)} big />
              <Metric color="c-purple" label="Recharge Revenue" value={formatPaise(data.recharge)} />
              <Metric color="c-amber" label="Consultation billing" value={formatPaise(data.consultation)} />
              <Metric color="c-rose" label="Refunds" value={formatPaise(data.refunds)} />
              <Metric color="c-gold" label="Bonus (free credit)" value={formatPaise(data.bonus)} />
            </div>

            <h3 style={{ margin: '4px 0 8px' }}>Daily breakdown</h3>
            <div className="card" style={{ height: 240 }}>
              {data.daily.length === 0 ? (
                <p className="muted">No revenue in this period.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.daily} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2f9c63" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#2f9c63" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#9891c2" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#9891c2" />
                    <Tooltip formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} />
                    <Area type="monotone" dataKey="amount" stroke="#2f9c63" strokeWidth={2} fill="url(#rev)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
