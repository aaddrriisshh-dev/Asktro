'use client';

import { useMemo } from 'react';
import { orderBy, limit, where } from 'firebase/firestore';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useCollection, Row } from '@/lib/hooks';
import { formatPaise } from '@/lib/format';

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toCsv(rows: Row[]): string {
  const header = ['id', 'userId', 'kind', 'amount', 'balanceAfter', 'createdAt'];
  const lines = rows.map((r) =>
    [r.id, r.userId ?? '', r.kind ?? '', r.amount ?? 0, r.balanceAfter ?? 0,
      r.createdAt?.toMillis ? new Date(r.createdAt.toMillis()).toISOString() : ''].join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

export default function ReportsPage() {
  // Recent recharges (revenue) and consultation charges.
  const recharges = useCollection('walletTransactions', [
    where('kind', '==', 'recharge'),
    orderBy('createdAt', 'desc'),
    limit(500),
  ]);
  const txns = useCollection('walletTransactions', [orderBy('createdAt', 'desc'), limit(1000)]);

  const revenueByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of recharges.rows) {
      const ms = r.createdAt?.toMillis?.();
      if (!ms) continue;
      const k = dayKey(ms);
      map.set(k, (map.get(k) ?? 0) + (r.amount ?? 0));
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([day, paise]) => ({ day: day.slice(5), rupees: Math.round(paise / 100) }));
  }, [recharges.rows]);

  const totalRevenue = recharges.rows.reduce((s, r) => s + (r.amount ?? 0), 0);

  function download() {
    const csv = toCsv(txns.rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'asktro-transactions.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Reports</h1>
        <button className="btn" onClick={download}>Export transactions (CSV)</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', marginBottom: 20 }}>
        <div className="card">
          <div className="muted" style={{ fontSize: 13 }}>Recharge revenue (last 500)</div>
          <div className="kpi-value" style={{ color: 'var(--primary)' }}>{formatPaise(totalRevenue)}</div>
        </div>
        <div className="card">
          <div className="muted" style={{ fontSize: 13 }}>Ledger entries loaded</div>
          <div className="kpi-value" style={{ color: 'var(--primary)' }}>{txns.rows.length}</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Revenue — last 14 days (₹)</h3>
        {revenueByDay.length === 0 ? (
          <p className="muted">No recharge data yet.</p>
        ) : (
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={revenueByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ECECEC" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="rupees" fill="#7E57C2" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
