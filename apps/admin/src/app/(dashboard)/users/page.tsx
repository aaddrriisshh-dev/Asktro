'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useCollection, callFn, Row } from '@/lib/hooks';
import { formatPaise, rupeesToPaise } from '@/lib/format';

const msOf = (t: { toMillis?: () => number } | undefined) => t?.toMillis?.() ?? 0;
const lastActive = (u: Row) => msOf(u.updatedAt) || msOf(u.createdAt);
const fmt = (m: number) => (m ? new Date(m).toLocaleString('en-IN') : '—');
const LIVE_WINDOW = 30 * 60 * 1000; // "live" = active in the last 30 minutes
const isLive = (m: number) => m > 0 && Date.now() - m < LIVE_WINDOW;

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

  async function credit(u: Row) {
    const input = prompt(`Credit how many ₹ to ${u.name || u.phone}?`);
    if (!input) return;
    try { await callFn('adjustWallet', { userId: u.id, amountPaise: rupeesToPaise(Number(input)), reason: 'Admin credit' }); alert('Credited.'); }
    catch (e) { alert('Failed: ' + (e as Error).message); }
  }

  const table = (list: Row[], showLiveDot: boolean, dateLabel: string) => (
    list.length === 0 ? <p className="drawer-muted">No customers here.</p> : (
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Customer</th><th>Wallet</th><th>{dateLabel}</th><th>Actions</th></tr></thead>
          <tbody>
            {list.slice(0, 200).map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="uat-user">
                    <span className="uat-name">
                      {showLiveDot && isLive(lastActive(u)) && <span className="live-dot" style={{ marginRight: 6 }} />}
                      {u.name || 'Unnamed'}
                    </span>
                    <span className="uat-phone">{u.phone || u.id.slice(0, 10)}</span>
                  </div>
                </td>
                <td>{formatPaise(u.walletBalance)}</td>
                <td className="muted">{fmt(showLiveDot ? lastActive(u) : msOf(u.createdAt))}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Link href={`/users/${u.id}`} className="btn sm secondary">View</Link>
                    <button className="btn sm" onClick={() => credit(u)}>Credit</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  );

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
        <>
          {/* SECTION 1 — Live Customers */}
          <div className="card sess-col sess-live" style={{ marginTop: 16 }}>
            <div className="sess-col-head">
              <h3 className="celeste" style={{ margin: 0 }}>🟢 Live Customers</h3>
              <span className="udet-total" style={{ background: 'rgba(60,179,113,.14)', color: '#2f9c63' }}>{live.length} active now</span>
            </div>
            <p className="muted" style={{ marginTop: 6, fontSize: 12.5 }}>Customers active in the last 30 minutes.</p>
            <div className="sess-scroll">{table(live, true, 'Last active')}</div>
          </div>

          {/* SECTION 2 — All Customers → Paid | Unpaid */}
          <h2 className="ops-heading" style={{ marginTop: 24 }}><span className="ops-heading-dot" />All Customers</h2>
          <div className="sess-split" style={{ marginTop: 8 }}>
            <div className="card sess-col" style={{ borderTop: '3px solid #2f9c63' }}>
              <div className="sess-col-head">
                <h3 className="celeste" style={{ margin: 0 }}>💚 Paid Customers</h3>
                <span className="udet-total">{paid.length}</span>
              </div>
              <p className="muted" style={{ marginTop: 6, fontSize: 12.5 }}>Have recharged at least once.</p>
              <div className="sess-scroll">{table(paid, false, 'Joined')}</div>
            </div>
            <div className="card sess-col" style={{ borderTop: '3px solid #c9a227' }}>
              <div className="sess-col-head">
                <h3 className="celeste" style={{ margin: 0 }}>🤍 Unpaid Customers</h3>
                <span className="udet-total">{unpaid.length}</span>
              </div>
              <p className="muted" style={{ marginTop: 6, fontSize: 12.5 }}>Never recharged yet.</p>
              <div className="sess-scroll">{table(unpaid, false, 'Joined')}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
