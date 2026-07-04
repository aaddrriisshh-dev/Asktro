'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { callFn } from '@/lib/hooks';
import { formatPaise, rupeesToPaise } from '@/lib/format';

interface UserRow {
  id: string;
  name: string;
  phone: string;
  chatMin: number;
  voiceMin: number;
  videoMin: number;
  paid: boolean;
  amount: number; // paise
  status: string;
  lastActive: number; // ms
}

const mins = (sec: number) => {
  const m = sec / 60;
  return Number.isInteger(m) ? `${m}` : m.toFixed(1);
};
const fmtDate = (ms: number) => (ms ? new Date(ms).toLocaleDateString('en-GB') : '—');

// ---- action icons ----------------------------------------------------------
const svg = (p: React.ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{p}</svg>
);
const icoEye = svg(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>);
const icoChat = svg(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />);
const icoPlus = svg(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>);
const icoSuspend = svg(<><circle cx="9" cy="7" r="4" /><path d="M17 11h6M1 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" /></>);
const icoTrash = svg(<><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>);

export function UsersActivityTable() {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [usersSnap, consSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'consultations')),
    ]);
    const secs = new Map<string, { chat: number; voice: number; video: number }>();
    consSnap.forEach((doc) => {
      const c = doc.data() as { customerId?: string; type?: string; billedSeconds?: number };
      if (!c.customerId) return;
      const cur = secs.get(c.customerId) ?? { chat: 0, voice: 0, video: 0 };
      const s = c.billedSeconds ?? 0;
      if (c.type === 'chat') cur.chat += s; else if (c.type === 'voice') cur.voice += s; else if (c.type === 'video') cur.video += s;
      secs.set(c.customerId, cur);
    });
    const list: UserRow[] = usersSnap.docs.map((doc) => {
      const u = doc.data() as {
        name?: string; phone?: string; totalRecharge?: number; accountStatus?: string;
        updatedAt?: { toMillis?: () => number }; createdAt?: { toMillis?: () => number };
      };
      const s = secs.get(doc.id) ?? { chat: 0, voice: 0, video: 0 };
      return {
        id: doc.id,
        name: u.name ?? '',
        phone: u.phone ?? '',
        chatMin: s.chat, voiceMin: s.voice, videoMin: s.video,
        paid: (u.totalRecharge ?? 0) > 0,
        amount: u.totalRecharge ?? 0,
        status: u.accountStatus ?? 'active',
        lastActive: u.updatedAt?.toMillis?.() ?? u.createdAt?.toMillis?.() ?? 0,
      };
    }).filter((u) => u.status !== 'deleted')
      .sort((a, b) => b.lastActive - a.lastActive);
    setRows(list);
  }

  useEffect(() => { load().catch(() => setRows([])); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !rows) return rows ?? [];
    return rows.filter((u) => u.name.toLowerCase().includes(q) || u.phone.includes(q) || u.id.includes(q));
  }, [rows, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const shown = filtered.slice(page * perPage, page * perPage + perPage);

  async function credit(u: UserRow) {
    const input = prompt(`Credit how many ₹ to ${u.name || u.phone}'s wallet?`);
    if (!input) return;
    setBusy(u.id);
    try {
      await callFn('adjustWallet', { userId: u.id, amountPaise: rupeesToPaise(Number(input)), reason: 'Admin credit' });
      alert('Credited.');
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(null); }
  }
  async function suspend(u: UserRow) {
    const next = u.status === 'blocked' ? 'active' : 'blocked';
    if (!confirm(`${next === 'blocked' ? 'Suspend' : 'Reactivate'} ${u.name || u.phone}?`)) return;
    setBusy(u.id);
    try {
      await callFn('setUserStatus', { userId: u.id, status: next });
      setRows((rs) => rs?.map((r) => (r.id === u.id ? { ...r, status: next } : r)) ?? rs);
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(null); }
  }
  async function remove(u: UserRow) {
    if (!confirm(`Delete ${u.name || u.phone}'s profile? This removes them from the list.`)) return;
    setBusy(u.id);
    try {
      await callFn('setUserStatus', { userId: u.id, status: 'deleted' });
      setRows((rs) => rs?.filter((r) => r.id !== u.id) ?? rs);
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <div className="card uat" style={{ marginTop: 22 }}>
      <div className="uat-head">
        <div>
          <h3 className="live-head" style={{ marginBottom: 2 }}><span className="live-dot" />Users activity</h3>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Every customer with their usage, payment status and quick actions.</p>
        </div>
        <input className="input uat-search" placeholder="Search name or phone…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="uat-table">
          <thead>
            <tr>
              <th>User</th><th>Chat</th><th>Voice</th><th>Video</th>
              <th>Payment</th><th>Amount</th><th>Last active</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={8} className="muted" style={{ padding: 20 }}>Loading…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={8} className="muted" style={{ padding: 20 }}>No users found.</td></tr>
            ) : shown.map((u) => (
              <tr key={u.id} className={u.status === 'blocked' ? 'uat-blocked' : ''}>
                <td>
                  <div className="uat-user">
                    <span className="uat-name">{u.name || 'Unnamed'}</span>
                    <span className="uat-phone">{u.phone || u.id.slice(0, 10)}</span>
                  </div>
                </td>
                <td><b>{mins(u.chatMin)}</b> <span className="uat-unit">min</span></td>
                <td><b>{mins(u.voiceMin)}</b> <span className="uat-unit">min</span></td>
                <td><b>{mins(u.videoMin)}</b> <span className="uat-unit">min</span></td>
                <td>
                  {u.paid
                    ? <span className="pay-pill paid">Paid</span>
                    : <span className="pay-pill free">Free</span>}
                </td>
                <td className="uat-amount">{u.paid ? formatPaise(u.amount) : '—'}</td>
                <td className="uat-date">{fmtDate(u.lastActive)}</td>
                <td>
                  <div className="uat-actions">
                    <Link href={`/users/${u.id}`} className="uat-act view" title="View profile" aria-label="View profile">{icoEye}</Link>
                    <Link href={`/users/${u.id}#chat`} className="uat-act chat" title="Chat log" aria-label="Chat log">{icoChat}</Link>
                    <button className="uat-act credit" title="Credit minutes / wallet" disabled={busy === u.id} onClick={() => credit(u)}>{icoPlus}</button>
                    <button className={`uat-act suspend${u.status === 'blocked' ? ' on' : ''}`} title={u.status === 'blocked' ? 'Reactivate' : 'Suspend'} disabled={busy === u.id} onClick={() => suspend(u)}>{icoSuspend}</button>
                    <button className="uat-act delete" title="Delete profile" disabled={busy === u.id} onClick={() => remove(u)}>{icoTrash}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows !== null && filtered.length > 0 && (
        <div className="uat-foot">
          <span className="muted">Showing {page * perPage + 1}–{Math.min(filtered.length, (page + 1) * perPage)} of {filtered.length}</span>
          <div className="uat-pager">
            <label className="muted">Rows
              <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(0); }}>
                <option value={25}>25</option><option value={100}>100</option><option value={200}>200</option><option value={500}>500</option>
              </select>
            </label>
            <button className="uat-pg" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</button>
            <span className="uat-pgn">{page + 1} / {pageCount}</span>
            <button className="uat-pg" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>›</button>
          </div>
        </div>
      )}
    </div>
  );
}
