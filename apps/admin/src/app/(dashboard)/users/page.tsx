'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useCollection, callFn, Row } from '@/lib/hooks';
import { formatPaise, rupeesToPaise } from '@/lib/format';

const msOf = (t: { toMillis?: () => number } | undefined) => t?.toMillis?.() ?? 0;
const lastActive = (u: Row) => msOf(u.updatedAt) || msOf(u.createdAt);
const fmt = (m: number) => (m ? new Date(m).toLocaleString('en-IN') : '—');
const isLive = (m: number) => m > 0 && Date.now() - m < 15 * 60 * 1000; // active in last 15 min

export default function CustomerManagementPage() {
  const { rows, loading } = useCollection('users');
  const [tab, setTab] = useState<'live' | 'all'>('live');
  const [pay, setPay] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [search, setSearch] = useState('');

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = rows.filter((u) => u.accountStatus !== 'deleted');
    if (q) r = r.filter((u) => (u.name ?? '').toLowerCase().includes(q) || (u.phone ?? '').includes(q) || u.id.includes(q));
    if (tab === 'all' && pay !== 'all') r = r.filter((u) => (((u.totalRecharge ?? 0) as number) > 0) === (pay === 'paid'));
    // Live tab: most-recently-active first; All tab: newest first.
    return r.sort((a, b) => (tab === 'live' ? lastActive(b) - lastActive(a) : msOf(b.createdAt) - msOf(a.createdAt)));
  }, [rows, tab, pay, search]);

  const paidCount = rows.filter((u) => ((u.totalRecharge ?? 0) as number) > 0 && u.accountStatus !== 'deleted').length;
  const total = rows.filter((u) => u.accountStatus !== 'deleted').length;

  async function credit(u: Row) {
    const input = prompt(`Credit how many ₹ to ${u.name || u.phone}?`);
    if (!input) return;
    try { await callFn('adjustWallet', { userId: u.id, amountPaise: rupeesToPaise(Number(input)), reason: 'Admin credit' }); alert('Credited.'); }
    catch (e) { alert('Failed: ' + (e as Error).message); }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Customer Management</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Every customer, with live activity and payment status.</p>

      <div className="aview-tabs" style={{ marginTop: 14 }}>
        <button className={`aview-tab${tab === 'live' ? ' on' : ''}`} onClick={() => setTab('live')}>🟢 Live Customers</button>
        <button className={`aview-tab${tab === 'all' ? ' on' : ''}`} onClick={() => setTab('all')}>All Customers</button>
      </div>

      <div className="uat-head" style={{ marginTop: 6 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {tab === 'all' && (
            <div className="pickrow">
              <button className={`pickchip${pay === 'all' ? ' on' : ''}`} onClick={() => setPay('all')}>All ({total})</button>
              <button className={`pickchip${pay === 'paid' ? ' on' : ''}`} onClick={() => setPay('paid')}>Paid ({paidCount})</button>
              <button className={`pickchip${pay === 'unpaid' ? ' on' : ''}`} onClick={() => setPay('unpaid')}>Unpaid ({total - paidCount})</button>
            </div>
          )}
          {tab === 'live' && <span className="muted" style={{ fontSize: 13 }}>Sorted by most recent activity · a green dot = active in the last 15 minutes.</span>}
        </div>
        <input className="input uat-search" placeholder="Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        {loading ? <p className="muted">Loading…</p> : list.length === 0 ? <p className="muted">No customers found.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Customer</th><th>Payment</th><th>Wallet</th><th>Bonus</th><th>Last active</th><th>Actions</th></tr></thead>
              <tbody>
                {list.slice(0, 300).map((u) => {
                  const la = lastActive(u);
                  const paid = ((u.totalRecharge ?? 0) as number) > 0;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="uat-user">
                          <span className="uat-name">
                            {tab === 'live' && isLive(la) && <span className="live-dot" style={{ marginRight: 6 }} />}
                            {u.name || 'Unnamed'}
                          </span>
                          <span className="uat-phone">{u.phone || u.id.slice(0, 10)}</span>
                        </div>
                      </td>
                      <td>{paid ? <span className="pay-pill paid">Paid</span> : <span className="pay-pill free">Free</span>}</td>
                      <td>{formatPaise(u.walletBalance)}</td>
                      <td>{formatPaise(u.bonusBalance)}</td>
                      <td className="muted">{fmt(la)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Link href={`/users/${u.id}`} className="btn sm secondary">View</Link>
                          <button className="btn sm" onClick={() => credit(u)}>Credit</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
