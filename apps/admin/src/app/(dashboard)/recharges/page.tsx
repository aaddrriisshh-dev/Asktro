'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, query, where, orderBy, limit, onSnapshot, getDoc, doc, Timestamp,
  QueryConstraint,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatPaise, formatDate } from '@/lib/format';

/** A single credited recharge (walletTransactions row, kind == 'recharge'). */
interface Recharge {
  id: string;
  userId: string;
  amount: number;      // wallet credit in paise
  refId?: string;      // Razorpay payment id
  note?: string;       // e.g. "Recharge (webhook) order ord_xxx"
  createdAtMs?: number;
}

type Preset = 'today' | 'yesterday' | 'tomorrow' | 'month' | 'all' | 'custom';

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
  { key: 'custom', label: 'Custom' },
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const toInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Resolve [start, end) Date bounds for a preset (null = unbounded / all time). */
function boundsFor(preset: Preset, fromStr: string, toStr: string): { start: Date | null; end: Date | null } {
  const today = startOfDay(new Date());
  switch (preset) {
    case 'today': return { start: today, end: addDays(today, 1) };
    case 'yesterday': return { start: addDays(today, -1), end: today };
    case 'tomorrow': return { start: addDays(today, 1), end: addDays(today, 2) };
    case 'month': return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: addDays(today, 1) };
    case 'all': return { start: null, end: null };
    case 'custom': {
      const s = fromStr ? startOfDay(new Date(fromStr)) : null;
      // Custom range is inclusive of the "to" day, so end is the start of the next day.
      const e = toStr ? addDays(startOfDay(new Date(toStr)), 1) : null;
      return { start: s, end: e };
    }
  }
}

/** Portal screen: a live, filterable log of every real customer recharge. Reads
 *  the immutable walletTransactions ledger (kind == 'recharge') in real time, so
 *  a payment shows here the instant it credits. Money screen → super/ops only. */
export default function RechargesPage() {
  const [preset, setPreset] = useState<Preset>('today');
  const [from, setFrom] = useState(toInput(addDays(new Date(), -7)));
  const [to, setTo] = useState(toInput(new Date()));
  const [rows, setRows] = useState<Recharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // userId → { name, phone } cache, so we resolve each customer at most once even
  // as the live table churns. A ref keeps the cache stable across re-renders; a
  // version counter re-renders the table when new names land.
  const nameCache = useRef<Map<string, { name: string; phone: string }>>(new Map());
  const [, bump] = useState(0);

  const { start, end } = useMemo(() => boundsFor(preset, from, to), [preset, from, to]);

  // Live subscription. Bound queries range on createdAt only (backed by the
  // kind+createdAt composite index); we keep it to kind == 'recharge'.
  useEffect(() => {
    setLoading(true);
    setError(null);
    const base = collection(db, 'walletTransactions');
    const cons: QueryConstraint[] = [where('kind', '==', 'recharge')];
    if (start) cons.push(where('createdAt', '>=', Timestamp.fromDate(start)));
    if (end) cons.push(where('createdAt', '<', Timestamp.fromDate(end)));
    cons.push(orderBy('createdAt', 'desc'));
    if (!start && !end) cons.push(limit(500)); // cap the unbounded "All Time" view
    const unsub = onSnapshot(
      query(base, ...cons),
      (snap) => {
        setRows(snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            userId: x.userId as string,
            amount: (x.amount as number) ?? 0,
            refId: (x.refId as string) ?? undefined,
            note: (x.note as string) ?? undefined,
            createdAtMs: x.createdAt?.toMillis?.(),
          };
        }));
        setLoading(false);
      },
      (e) => { setError(e.message); setLoading(false); },
    );
    return unsub;
  }, [start, end]);

  // Lazily resolve customer names for whatever userIds are on screen.
  useEffect(() => {
    const missing = [...new Set(rows.map((r) => r.userId))].filter((id) => id && !nameCache.current.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      await Promise.all(missing.map(async (id) => {
        try {
          const s = await getDoc(doc(db, 'users', id));
          const u = s.data() ?? {};
          nameCache.current.set(id, { name: (u.name as string) || (u.displayName as string) || '', phone: (u.phone as string) || '' });
        } catch {
          nameCache.current.set(id, { name: '', phone: '' });
        }
      }));
      if (!cancelled) bump((n) => n + 1);
    })();
    return () => { cancelled = true; };
  }, [rows]);

  const total = rows.reduce((n, r) => n + r.amount, 0);
  const source = (note?: string) => {
    const m = note?.match(/\((webhook|callable)\)/);
    return m ? m[1] : '—';
  };

  return (
    <div>
      <h1>Recharges</h1>
      <p className="muted" style={{ marginTop: -6, marginBottom: 16 }}>
        Every real customer recharge, live. Updates the instant a payment credits.
      </p>

      <div className="pickrow" style={{ marginBottom: 12 }}>
        {PRESETS.map((p) => (
          <button key={p.key} type="button" className={`pickchip${preset === p.key ? ' on' : ''}`} onClick={() => setPreset(p.key)}>
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
          <label className="af" style={{ maxWidth: 180 }}><span>From</span>
            <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="af" style={{ maxWidth: 180 }}><span>To</span>
            <input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div className="muted" style={{ fontSize: 12, letterSpacing: 0.5 }}>RECHARGES</div>
            <strong style={{ fontSize: 22 }}>{rows.length}</strong>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12, letterSpacing: 0.5 }}>TOTAL</div>
            <strong style={{ fontSize: 22 }}>{formatPaise(total)}</strong>
          </div>
        </div>

        {error ? (
          <p className="muted" style={{ color: 'var(--danger, #c0392b)' }}>Couldn’t load: {error}</p>
        ) : loading ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No recharges in this period.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cardify">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Payment ID</th>
                  <th>Source</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const who = nameCache.current.get(r.userId);
                  return (
                    <tr key={r.id}>
                      <td data-label="Customer">
                        {who?.name || <span className="muted">{r.userId.slice(0, 8)}…</span>}
                        {who?.phone ? <div className="muted" style={{ fontSize: 12 }}>{who.phone}</div> : null}
                      </td>
                      <td data-label="Amount"><strong>{formatPaise(r.amount)}</strong></td>
                      <td data-label="Payment ID">
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{r.refId || '—'}</span>
                      </td>
                      <td data-label="Source">{source(r.note)}</td>
                      <td data-label="When">{formatDate(r.createdAtMs)}</td>
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
