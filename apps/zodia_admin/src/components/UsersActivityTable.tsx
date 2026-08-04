'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  collection, query, orderBy, limit, startAfter, startAt, endAt,
  getDocs, getCountFromServer, QueryDocumentSnapshot, DocumentData,
} from 'firebase/firestore';
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

// Map a user doc to a row. Usage minutes come from the denormalized
// `usageSeconds` counters maintained at billing settle-time (endConsultation /
// timed-out sweep) — the table NEVER scans the unbounded consultations
// collection, which is what used to OOM the browser at scale.
function mapUser(doc: QueryDocumentSnapshot<DocumentData>): UserRow {
  const u = doc.data() as {
    name?: string; phone?: string; totalRecharge?: number; accountStatus?: string;
    usageSeconds?: { chat?: number; voice?: number; video?: number };
    updatedAt?: { toMillis?: () => number }; createdAt?: { toMillis?: () => number };
  };
  const us = u.usageSeconds ?? {};
  return {
    id: doc.id,
    name: u.name ?? '',
    phone: u.phone ?? '',
    chatMin: us.chat ?? 0, voiceMin: us.voice ?? 0, videoMin: us.video ?? 0,
    paid: (u.totalRecharge ?? 0) > 0,
    amount: u.totalRecharge ?? 0,
    status: u.accountStatus ?? 'active',
    lastActive: u.updatedAt?.toMillis?.() ?? u.createdAt?.toMillis?.() ?? 0,
  };
}

// ---- action icons ----------------------------------------------------------
const svg = (p: React.ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{p}</svg>
);
const icoEye = svg(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>);
const icoChat = svg(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />);
const icoPlus = svg(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>);
const icoSuspend = svg(<><circle cx="9" cy="7" r="4" /><path d="M17 11h6M1 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" /></>);
const icoTrash = svg(<><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>);

const SEARCH_LIMIT = 50;

export function UsersActivityTable() {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState(''); // committed (server-side) search
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [total, setTotal] = useState<number | null>(null);
  const [atEnd, setAtEnd] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // pageCursors[i] = the doc to startAfter when loading page i (undefined for
  // page 0). Filled in as the admin pages forward; prev pages reuse their cursor.
  const pageCursors = useRef<Array<QueryDocumentSnapshot<DocumentData> | undefined>>([undefined]);

  const searching = searchTerm.trim().length > 0;

  // Total user count — one server-side aggregation, no docs downloaded.
  useEffect(() => {
    getCountFromServer(collection(db, 'users'))
      .then((s) => setTotal(s.data().count))
      .catch(() => setTotal(null));
  }, []);

  const loadBrowsePage = useCallback(async (p: number) => {
    setRows(null); setErr(null);
    try {
      const after = pageCursors.current[p];
      const parts = [orderBy('createdAt', 'desc'), limit(perPage + 1)];
      const qy = after
        ? query(collection(db, 'users'), orderBy('createdAt', 'desc'), startAfter(after), limit(perPage + 1))
        : query(collection(db, 'users'), ...parts);
      const snap = await getDocs(qy);
      const docs = snap.docs;
      const hasMore = docs.length > perPage;
      const pageDocs = docs.slice(0, perPage);
      // Remember the cursor for the NEXT page (last doc of this page).
      pageCursors.current[p + 1] = pageDocs[pageDocs.length - 1];
      setAtEnd(!hasMore);
      setRows(pageDocs.map(mapUser).filter((u) => u.status !== 'deleted'));
    } catch (e) {
      setErr((e as Error).message); setRows([]);
    }
  }, [perPage]);

  const runSearch = useCallback(async (term: string) => {
    const t = term.trim();
    setRows(null); setErr(null);
    try {
      // Server-side PREFIX search on the primary lookup keys (phone for digits,
      // else name), bounded to SEARCH_LIMIT rows. Case-sensitive on name is a
      // Firestore limitation; phone lookups are exact-prefix.
      const field = /^\+?\d+$/.test(t) ? 'phone' : 'name';
      const qy = query(collection(db, 'users'), orderBy(field), startAt(t), endAt(t + ''), limit(SEARCH_LIMIT));
      const snap = await getDocs(qy);
      setRows(snap.docs.map(mapUser).filter((u) => u.status !== 'deleted'));
    } catch (e) {
      setErr((e as Error).message); setRows([]);
    }
  }, []);

  // Drive loading off committed search term + page + perPage.
  useEffect(() => {
    if (searching) runSearch(searchTerm);
    else loadBrowsePage(page);
  }, [searching, searchTerm, page, perPage, runSearch, loadBrowsePage]);

  function submitSearch(term: string) {
    pageCursors.current = [undefined];
    setPage(0);
    setSearchTerm(term);
  }

  async function credit(u: UserRow) {
    const input = prompt(`Credit how many ₹ to ${u.name || u.phone}'s wallet?`);
    if (!input) return;
    setBusy(u.id);
    try {
      await callFn('adjustWallet', { userId: u.id, amountPaise: rupeesToPaise(Number(input)), reason: 'Admin credit', opId: crypto.randomUUID() });
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

  const shown = rows ?? [];
  const startIdx = searching ? 0 : page * perPage;

  return (
    <div className="card uat" style={{ marginTop: 22 }}>
      <div className="uat-head">
        <div>
          <h3 className="live-head" style={{ marginBottom: 2 }}><span className="live-dot" />Users activity</h3>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Every customer with their usage, payment status and quick actions.</p>
        </div>
        <input
          className="input uat-search"
          placeholder="Search phone or name, then Enter…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitSearch(searchInput); }}
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="uat-table cardify">
          <thead>
            <tr>
              <th>User</th><th>Chat</th><th>Voice</th><th>Video</th>
              <th>Payment</th><th>Amount</th><th>Last active</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={8} data-label="" className="muted" style={{ padding: 20 }}>Loading…</td></tr>
            ) : err ? (
              <tr><td colSpan={8} data-label="" className="muted" style={{ padding: 20 }}>Couldn’t load users: {err}</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={8} data-label="" className="muted" style={{ padding: 20 }}>No users found.</td></tr>
            ) : shown.map((u) => (
              <tr key={u.id} className={u.status === 'blocked' ? 'uat-blocked' : ''}>
                <td data-label="User">
                  <div className="uat-user">
                    <span className="uat-name">{u.name || 'Unnamed'}</span>
                    <span className="uat-phone">{u.phone || u.id.slice(0, 10)}</span>
                  </div>
                </td>
                <td data-label="Chat"><b>{mins(u.chatMin)}</b> <span className="uat-unit">min</span></td>
                <td data-label="Voice"><b>{mins(u.voiceMin)}</b> <span className="uat-unit">min</span></td>
                <td data-label="Video"><b>{mins(u.videoMin)}</b> <span className="uat-unit">min</span></td>
                <td data-label="Payment">
                  {u.paid
                    ? <span className="pay-pill paid">Paid</span>
                    : <span className="pay-pill free">Free</span>}
                </td>
                <td data-label="Amount" className="uat-amount">{u.paid ? formatPaise(u.amount) : '—'}</td>
                <td data-label="Last active" className="uat-date">{fmtDate(u.lastActive)}</td>
                <td data-label="">
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

      {rows !== null && (
        <div className="uat-foot">
          <span className="muted">
            {searching
              ? `${shown.length} match${shown.length === 1 ? '' : 'es'}${shown.length >= SEARCH_LIMIT ? ' (refine to narrow)' : ''}`
              : `Showing ${shown.length ? startIdx + 1 : 0}–${startIdx + shown.length}${total !== null ? ` of ${total.toLocaleString('en-IN')}` : ''}`}
          </span>
          {searching ? (
            <div className="uat-pager">
              <button className="uat-pg" onClick={() => { setSearchInput(''); submitSearch(''); }}>Clear search</button>
            </div>
          ) : (
            <div className="uat-pager">
              <label className="muted">Rows
                <select value={perPage} onChange={(e) => { pageCursors.current = [undefined]; setPage(0); setPerPage(Number(e.target.value)); }}>
                  <option value={10}>10</option><option value={25}>25</option><option value={100}>100</option><option value={200}>200</option>
                </select>
              </label>
              <button className="uat-pg" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>‹</button>
              <span className="uat-pgn">Page {page + 1}</span>
              <button className="uat-pg" disabled={atEnd} onClick={() => setPage((p) => p + 1)}>›</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
