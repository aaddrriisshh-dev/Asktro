'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, query, where, orderBy, limit, onSnapshot, getDoc, doc, Timestamp,
  QueryConstraint,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatPaise, formatDate, shortDay } from '@/lib/format';
import { DailyChart } from '@/components/DailyChart';
import { Metric } from '@/components/Metric';

/** A single credited recharge (walletTransactions row, kind == 'recharge'). */
interface Recharge {
  id: string;
  userId: string;
  amount: number;      // wallet credit in paise
  refId?: string;      // Razorpay payment id
  note?: string;       // e.g. "Recharge (webhook) order ord_xxx"
  createdAtMs?: number;
}

type Preset = 'today' | 'yesterday' | 'tomorrow' | 'month' | 'year' | 'all' | 'custom';

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
  { key: 'custom', label: 'Custom' },
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const startOfYear = (d: Date) => new Date(d.getFullYear(), 0, 1);
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Resolve [start, end) Date bounds for a preset (null = unbounded / all time). */
function boundsFor(preset: Preset, fromStr: string, toStr: string): { start: Date | null; end: Date | null } {
  const today = startOfDay(new Date());
  switch (preset) {
    case 'today': return { start: today, end: addDays(today, 1) };
    case 'yesterday': return { start: addDays(today, -1), end: today };
    case 'tomorrow': return { start: addDays(today, 1), end: addDays(today, 2) };
    case 'month': return { start: startOfMonth(today), end: addDays(today, 1) };
    case 'year': return { start: startOfYear(today), end: addDays(today, 1) };
    case 'all': return { start: null, end: null };
    case 'custom': {
      const s = fromStr ? startOfDay(new Date(fromStr)) : null;
      // Inclusive of the "to" day → end is the start of the following day.
      const e = toStr ? addDays(startOfDay(new Date(toStr)), 1) : null;
      return { start: s, end: e };
    }
  }
}

/** Sum count + paise of the rows whose timestamp falls in [start, end). */
function tally(rows: Recharge[], start: Date, end: Date): { count: number; sum: number } {
  let count = 0, sum = 0;
  const s = start.getTime(), e = end.getTime();
  for (const r of rows) {
    if (r.createdAtMs != null && r.createdAtMs >= s && r.createdAtMs < e) { count++; sum += r.amount; }
  }
  return { count, sum };
}

function mapDocs(snap: { docs: { id: string; data: () => Record<string, unknown> }[] }): Recharge[] {
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      userId: x.userId as string,
      amount: (x.amount as number) ?? 0,
      refId: (x.refId as string) ?? undefined,
      note: (x.note as string) ?? undefined,
      createdAtMs: (x.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.(),
    };
  });
}

/** Portal screen: a live, filterable log of every real customer recharge, beside
 *  a compare-across-periods panel and a 30-day trend. Reads the immutable
 *  walletTransactions ledger (kind == 'recharge') in real time. Money → super/ops. */
export default function RechargesPage() {
  const [preset, setPreset] = useState<Preset>('today');
  const [from, setFrom] = useState(toIso(addDays(new Date(), -7)));
  const [to, setTo] = useState(toIso(new Date()));

  const [rows, setRows] = useState<Recharge[]>([]);       // left table: selected period
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [yearRows, setYearRows] = useState<Recharge[]>([]); // right panel: this-year window

  // userId → { name, phone } cache so each customer is resolved at most once.
  const nameCache = useRef<Map<string, { name: string; phone: string }>>(new Map());
  const [, bump] = useState(0);

  const { start, end } = useMemo(() => boundsFor(preset, from, to), [preset, from, to]);

  // LEFT — live subscription for the selected period. Bound queries range on
  // createdAt (backed by the kind+createdAt composite index); kind == 'recharge'.
  useEffect(() => {
    setLoading(true);
    setError(null);
    const cons: QueryConstraint[] = [where('kind', '==', 'recharge')];
    if (start) cons.push(where('createdAt', '>=', Timestamp.fromDate(start)));
    if (end) cons.push(where('createdAt', '<', Timestamp.fromDate(end)));
    cons.push(orderBy('createdAt', 'desc'));
    if (!start && !end) cons.push(limit(500)); // cap the unbounded "All Time" view
    const unsub = onSnapshot(
      query(collection(db, 'walletTransactions'), ...cons),
      (snap) => { setRows(mapDocs(snap)); setLoading(false); },
      (e) => { setError(e.message); setLoading(false); },
    );
    return unsub;
  }, [start, end]);

  // RIGHT — live subscription for the whole current year (drives compare + trend).
  useEffect(() => {
    const yStart = startOfYear(new Date());
    const unsub = onSnapshot(
      query(
        collection(db, 'walletTransactions'),
        where('kind', '==', 'recharge'),
        where('createdAt', '>=', Timestamp.fromDate(yStart)),
        orderBy('createdAt', 'desc'),
      ),
      (snap) => setYearRows(mapDocs(snap)),
      () => { /* surfaced by the left subscription's error */ },
    );
    return unsub;
  }, []);

  // Resolve customer names for whatever userIds are on screen (left table).
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
  const source = (note?: string) => note?.match(/\((webhook|callable)\)/)?.[1] ?? '—';

  // Compare-across-periods figures (from the live year window).
  const compare = useMemo(() => {
    const now = new Date();
    const t0 = startOfDay(now);
    const rowsSel = start && end ? tally(yearRows, start, end) : { count: rows.length, sum: total };
    return [
      { key: 'today', label: 'Today', ...tally(yearRows, t0, addDays(t0, 1)) },
      { key: 'yesterday', label: 'Yesterday', ...tally(yearRows, addDays(t0, -1), t0) },
      { key: 'month', label: 'This Month', ...tally(yearRows, startOfMonth(now), addDays(t0, 1)) },
      { key: 'year', label: 'This Year', ...tally(yearRows, startOfYear(now), addDays(t0, 1)) },
      { key: 'sel', label: 'Selected', ...rowsSel },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearRows, start, end, rows.length, total]);

  // 30-day trend (rupees per day) from the live year window.
  const daily = useMemo(() => {
    const today0 = startOfDay(new Date());
    const byDay = new Map<string, number>();
    for (const r of yearRows) {
      if (r.createdAtMs == null) continue;
      const iso = toIso(startOfDay(new Date(r.createdAtMs)));
      byDay.set(iso, (byDay.get(iso) ?? 0) + r.amount);
    }
    const out: { day: string; value: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const iso = toIso(addDays(today0, -i));
      out.push({ day: shortDay(iso), value: Math.round((byDay.get(iso) ?? 0) / 100) });
    }
    return out;
  }, [yearRows]);

  const COMPARE_COLORS = ['c-purple', 'c-blue', 'c-amber', 'c-green', 'c-gold'];

  return (
    <div>
      <div className="live-head">
        <span className="live-dot" />
        <h1 style={{ margin: 0 }}>Recharges</h1>
      </div>
      <p className="muted" style={{ marginTop: 6, marginBottom: 16 }}>
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

      <div className="rch-split">
        {/* LEFT — live detail table for the selected period */}
        <div className="card">
          <div className="metricgrid" style={{ marginBottom: 18 }}>
            <Metric color="c-purple" label="Recharges (selected)" value={String(rows.length)} big />
            <Metric color="c-green" label="Total collected" value={formatPaise(total)} big />
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
                  <tr><th>Customer</th><th>Amount</th><th>Payment ID</th><th>Source</th><th>When</th></tr>
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

        {/* RIGHT — compare across periods + 30-day trend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h3 style={{ margin: '0 0 14px' }}>Compare periods</h3>
            <div className="metricgrid" style={{ marginBottom: 0 }}>
              {compare.map((c, i) => (
                <Metric
                  key={c.key}
                  color={COMPARE_COLORS[i % COMPARE_COLORS.length]}
                  label={`${c.label} · ${c.count} recharge${c.count === 1 ? '' : 's'}`}
                  value={formatPaise(c.sum)}
                />
              ))}
            </div>
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 12px' }}>Last 30 days</h3>
            <div className="drawer-chart">
              <DailyChart data={daily} color="#2e4a8f" name="Recharges" money />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
