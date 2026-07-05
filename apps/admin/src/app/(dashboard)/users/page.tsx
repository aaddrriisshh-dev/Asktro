'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useCollection, Row } from '@/lib/hooks';
import { formatPaise } from '@/lib/format';

const msOf = (t: { toMillis?: () => number } | undefined) => t?.toMillis?.() ?? 0;
const lastActive = (u: Row) => msOf(u.updatedAt) || msOf(u.createdAt);
const LIVE_WINDOW = 30 * 60 * 1000; // "live" = active in the last 30 minutes
const isLive = (m: number) => m > 0 && Date.now() - m < LIVE_WINDOW;

const PAGE_OPTIONS = [10, 100, 500, 1000];

function CustomerBox({ title, icon, accent, list, live }: { title: string; icon: string; accent: string; list: Row[]; live?: boolean }) {
  const [limit, setLimit] = useState(10);
  const shown = list.slice(0, limit);
  return (
    <div className="card custcard" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="sess-col-head">
        <h3 className="celeste" style={{ margin: 0, fontSize: 16 }}>{icon} {title}</h3>
        <span className="udet-total">{list.length}</span>
      </div>
      <div className="custlist">
        {shown.length === 0 ? <p className="drawer-muted" style={{ margin: '10px 0' }}>No customers here.</p> : shown.map((u) => (
          <div key={u.id} className="custrow">
            <div style={{ minWidth: 0 }}>
              <span className="nm">
                {live && isLive(lastActive(u)) && <span className="live-dot" style={{ marginRight: 6 }} />}
                {u.name || 'Unnamed'}
              </span>
              <span className="ph">{u.phone || u.id.slice(0, 10)}</span>
            </div>
            <div className="custrow-right">
              <span className="cust-wallet">{formatPaise(u.walletBalance)}</span>
              <Link href={`/users/${u.id}`} className="btn sm secondary">View</Link>
            </div>
          </div>
        ))}
      </div>
      <div className="custfoot">
        <span className="muted">Showing {Math.min(limit, list.length)} of {list.length}</span>
        <label className="muted">Rows
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

export default function CustomerManagementPage() {
  const { rows, loading } = useCollection('users');
  const [search, setSearch] = useState('');

  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = rows.filter((u) => u.accountStatus !== 'deleted');
    if (q) r = r.filter((u) => (u.name ?? '').toLowerCase().includes(q) || (u.phone ?? '').includes(q) || u.id.includes(q));
    return r;
  }, [rows, search]);

  const live = useMemo(() => base.filter((u) => isLive(lastActive(u))).sort((a, b) => lastActive(b) - lastActive(a)), [base]);
  const paid = useMemo(() => base.filter((u) => ((u.totalRecharge ?? 0) as number) > 0).sort((a, b) => msOf(b.createdAt) - msOf(a.createdAt)), [base]);
  const unpaid = useMemo(() => base.filter((u) => ((u.totalRecharge ?? 0) as number) === 0).sort((a, b) => msOf(b.createdAt) - msOf(a.createdAt)), [base]);

  return (
    <div>
      <div className="uat-head">
        <div>
          <h1 style={{ marginBottom: 2 }}>Customer Management</h1>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Live customers, and all customers split by paid vs unpaid.</p>
        </div>
        <input className="input uat-search" placeholder="Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? <p className="muted" style={{ marginTop: 16 }}>Loading…</p> : (
        <div className="cust3">
          <CustomerBox title="Live Customers" icon="🟢" accent="#3cb371" list={live} live />
          <CustomerBox title="Paid Customers" icon="💚" accent="#2f9c63" list={paid} />
          <CustomerBox title="Unpaid Customers" icon="🤍" accent="#c9a227" list={unpaid} />
        </div>
      )}
    </div>
  );
}
