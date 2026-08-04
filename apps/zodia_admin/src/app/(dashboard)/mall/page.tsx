'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { limit, orderBy, Timestamp } from 'firebase/firestore';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell,
} from 'recharts';
import { useCollection, Row } from '@/lib/hooks';
import { formatPaise } from '@/lib/format';
import { DateFilter } from '@/components/DateFilter';
import { Preset, Range, resolveRange } from '@/lib/dateRange';
import { useLowStockThreshold } from '@/lib/storeSettings';

const PAID = new Set(['confirmed', 'packed', 'processing', 'shipped', 'delivered']);
const TOSHIP = new Set(['confirmed', 'paid', 'processing', 'packed']);
const DAY = 86_400_000;

const STATUS_COLOR: Record<string, string> = {
  pending_payment: '#b9a98a', confirmed: '#c8871a', processing: '#c8871a', packed: '#3b82c4',
  shipped: '#3b82c4', delivered: '#1e9e63', cancelled: '#c4562e',
};
const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Pending', confirmed: 'Confirmed', processing: 'Processing', packed: 'Packed',
  shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled',
};

function ms(o: Row): number {
  const t = o.createdAt as Timestamp | undefined;
  return t && typeof t.toMillis === 'function' ? t.toMillis() : 0;
}
const inRange = (o: Row, r: Range) => { const t = ms(o); return t >= r.start && t < r.end; };
const startOfUtcDay = (t: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
const startOfUtcHour = (t: number) => Math.floor(t / 3_600_000) * 3_600_000;
const startOfUtcMonth = (t: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
const nextUtcMonth = (t: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); };
const dayLabel = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const hourLabel = (t: number) => new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', hour12: true, timeZone: 'UTC' });
const monthLabel = (t: number) => new Date(t).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });

type Bucket = { key: number; day: string; value: number; orders: number };

/** A self-contained date-range selector. Each card owns one so it can be
 *  filtered independently of the rest of the dashboard. */
function usePeriod(def: Preset = 'last30') {
  const [preset, setPreset] = useState<Preset>(def);
  const [custom, setCustom] = useState<{ start?: string; end?: string }>({});
  const range = useMemo(() => resolveRange(preset, custom), [preset, custom]);
  return { preset, custom, setPreset, setCustom, range };
}
type Period = ReturnType<typeof usePeriod>;
function CardFilter({ p }: { p: Period }) {
  return <DateFilter preset={p.preset} custom={p.custom} onPreset={p.setPreset} onCustom={p.setCustom} />;
}

/** Group paid orders into a time series whose granularity adapts to the span:
 *  a single day → hourly, up to ~3 months → daily, longer → monthly. Only the
 *  window that actually holds data is drawn. */
function buildTrend(paid: Row[], range: Range): { rows: Bucket[]; unit: 'hour' | 'day' | 'month' } {
  if (paid.length === 0) return { rows: [], unit: 'day' };
  const times = paid.map(ms);
  const lo = Math.max(range.start, Math.min(...times));
  const hi = Math.min(range.end, Math.max(...times) + 1);
  const span = Math.max(1, hi - lo);
  const unit: 'hour' | 'day' | 'month' = span <= DAY * 1.5 ? 'hour' : span <= DAY * 92 ? 'day' : 'month';

  const rows: Bucket[] = [];
  const idx = new Map<number, number>();
  const push = (k: number, label: string) => { idx.set(k, rows.length); rows.push({ key: k, day: label, value: 0, orders: 0 }); };
  if (unit === 'hour') for (let t = startOfUtcHour(lo); t < hi; t += 3_600_000) push(t, hourLabel(t));
  else if (unit === 'day') for (let t = startOfUtcDay(lo); t < hi; t += DAY) push(t, dayLabel(t));
  else for (let t = startOfUtcMonth(lo); t < hi; t = nextUtcMonth(t)) push(t, monthLabel(t));

  for (const o of paid) {
    const t = ms(o);
    const k = unit === 'hour' ? startOfUtcHour(t) : unit === 'day' ? startOfUtcDay(t) : startOfUtcMonth(t);
    const i = idx.get(k);
    if (i != null) { rows[i].value += Math.round(((o.totalPaise as number) || 0) / 100); rows[i].orders += 1; }
  }
  return { rows, unit };
}

/** Zodia Mall — a full e-commerce dashboard. The banner filter drives the
 *  headline KPIs; every chart below carries its own date filter so each metric
 *  can be viewed over its own window. */
export default function MallDashboardPage() {
  const { rows: products } = useCollection('storeProducts');
  const { rows: orders } = useCollection('storeOrders', [orderBy('createdAt', 'desc'), limit(1000)]);

  const head = usePeriod();

  const kpi = useMemo(() => {
    const span = Math.max(1, head.range.end - head.range.start);
    const prev: Range = { start: head.range.start - span, end: head.range.start, label: 'prev' };
    const paid = orders.filter((o) => PAID.has(o.status as string) && inRange(o, head.range));
    const revenue = paid.reduce((s, o) => s + ((o.totalPaise as number) || 0), 0);
    const orderCount = paid.length;
    const aov = orderCount ? Math.round(revenue / orderCount) : 0;
    const customers = new Set(paid.map((o) => o.userId as string)).size;
    const discounts = paid.reduce((s, o) => s + ((o.discountPaise as number) || 0), 0);
    let units = 0;
    for (const o of paid) for (const it of ((o.items as Row[]) ?? [])) units += (it.qty as number) || 0;

    const prevPaid = orders.filter((o) => PAID.has(o.status as string) && inRange(o, prev));
    const prevRevenue = prevPaid.reduce((s, o) => s + ((o.totalPaise as number) || 0), 0);
    const pct = (cur: number, was: number): number | 'new' | null =>
      was > 0 ? Math.round(((cur - was) / was) * 100) : cur > 0 ? 'new' : null;

    return {
      revenue, orderCount, aov, customers, units, discounts,
      revDelta: pct(revenue, prevRevenue), orderDelta: pct(orderCount, prevPaid.length),
    };
  }, [orders, head.range]);

  // Operational + inventory — always "as of now".
  const lowThreshold = useLowStockThreshold();
  const now = useMemo(() => {
    const toShip = orders.filter((o) => TOSHIP.has(o.status as string)).length;
    const pending = orders.filter((o) => o.status === 'pending_payment').length;
    const activeProducts = products.filter((p) => p.active !== false).length;
    const lowStock = products.filter((p) => typeof p.stock === 'number' && (p.stock as number) <= lowThreshold && (p.stock as number) > 0);
    const outStock = products.filter((p) => typeof p.stock === 'number' && (p.stock as number) <= 0);
    const stockValue = products.reduce((s, p) => s + ((typeof p.stock === 'number' ? (p.stock as number) : 0) * ((p.pricePaise as number) || 0)), 0);
    return { toShip, pending, activeProducts, totalProducts: products.length, lowStock, outStock, stockValue };
  }, [orders, products, lowThreshold]);

  const showDelta = head.preset !== 'allTime';

  return (
    <div>
      {/* Hero */}
      <div className="mall-hero">
        <div className="mall-hero__icon">🛍️</div>
        <div style={{ minWidth: 0 }}>
          <h1 className="mall-hero__title">Zodia Mall</h1>
          <p className="mall-hero__sub">
            {head.range.label} · {formatPaise(kpi.revenue)} from {kpi.orderCount} paid order{kpi.orderCount === 1 ? '' : 's'} · {kpi.customers} customer{kpi.customers === 1 ? '' : 's'}
          </p>
        </div>
        <div className="mall-hero__tools">
          <CardFilter p={head} />
          {(now.pending > 0 || now.toShip > 0 || now.outStock.length > 0) && (
            <div className="mall-hero__alerts">
              {now.toShip > 0 && <span className="mall-alert">📦 {now.toShip} to ship</span>}
              {now.outStock.length > 0 && <span className="mall-alert warn">⚠ {now.outStock.length} out of stock</span>}
              {now.pending > 0 && <span className="mall-alert">⏳ {now.pending} unpaid</span>}
            </div>
          )}
        </div>
      </div>

      {/* Headline KPI tiles — driven by the banner filter */}
      <div className="mall-kpis">
        <Kpi label="Revenue" value={formatPaise(kpi.revenue)} accent="#1e9e63" delta={showDelta ? kpi.revDelta : undefined} sub="in this period" />
        <Kpi label="Orders" value={kpi.orderCount} delta={showDelta ? kpi.orderDelta : undefined} sub={`${now.pending} pending now`} />
        <Kpi label="Avg order value" value={formatPaise(kpi.aov)} />
        <Kpi label="Units sold" value={kpi.units} />
        <Kpi label="Customers" value={kpi.customers} sub="who bought" />
        <Kpi label="Discounts given" value={formatPaise(kpi.discounts)} accent={kpi.discounts ? '#c8871a' : undefined} sub="coupons" />
      </div>

      {/* Each card below filters independently */}
      <div className="mall-2col">
        <RevenueCard orders={orders} />
        <StatusCard orders={orders} />
      </div>
      <div className="mall-2col">
        <TopProductsCard orders={orders} />
        <RecentOrdersCard orders={orders} />
      </div>

      {/* Inventory health — always current */}
      <div className="card" style={{ marginTop: 4 }}>
        <div className="mall-card-h">
          <h3>Inventory health <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· as of now</span></h3>
          <Link href="/store-inventory" className="mall-link">Manage inventory →</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginTop: 6 }}>
          <MiniStat label="Stock value" value={formatPaise(now.stockValue)} />
          <MiniStat label="Live products" value={`${now.activeProducts}/${now.totalProducts}`} />
          <MiniStat label={`Low stock (≤${lowThreshold})`} value={now.lowStock.length} warn={!!now.lowStock.length} />
          <MiniStat label="Out of stock" value={now.outStock.length} warn={!!now.outStock.length} />
        </div>
        {(now.lowStock.length > 0 || now.outStock.length > 0) && (
          <div style={{ marginTop: 12 }}>
            {[...now.outStock, ...now.lowStock].slice(0, 8).map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid #f0e7d2', fontSize: 13.5 }}>
                <span>{p.title as string}</span>
                <strong style={{ color: (p.stock as number) <= 0 ? '#c4562e' : '#b8860b' }}>
                  {(p.stock as number) <= 0 ? 'OUT' : `${p.stock as number} left`}
                </strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RevenueCard({ orders }: { orders: Row[] }) {
  const p = usePeriod();
  const { rows, unit } = useMemo(() => {
    const paid = orders.filter((o) => PAID.has(o.status as string) && inRange(o, p.range));
    return buildTrend(paid, p.range);
  }, [orders, p.range]);
  const title = unit === 'hour' ? 'Revenue — by hour' : unit === 'month' ? 'Revenue — by month' : 'Revenue — by day';
  return (
    <div className="card">
      <div className="mall-card-h"><h3>{title}</h3><CardFilter p={p} /></div>
      <div style={{ height: 230 }}>
        {rows.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="muted">No sales in this period.</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c8871a" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#c8871a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#efe3c8" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#8a744e' }} stroke="#e7d9b8"
                interval={Math.max(0, Math.floor(rows.length / 8))} />
              <YAxis tick={{ fontSize: 11, fill: '#8a744e' }} stroke="#e7d9b8" allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e7d9b8', borderRadius: 10, color: '#5a3d0c' }}
                formatter={(v: number, _n, pl) => [`₹${v.toLocaleString('en-IN')} · ${(pl.payload as Bucket).orders} order${(pl.payload as Bucket).orders === 1 ? '' : 's'}`, 'Revenue']} />
              <Area type="monotone" dataKey="value" stroke="#c8871a" strokeWidth={2.4} fill="url(#gGold)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function StatusCard({ orders }: { orders: Row[] }) {
  const p = usePeriod();
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) if (inRange(o, p.range)) map.set(o.status as string, (map.get(o.status as string) ?? 0) + 1);
    return map;
  }, [orders, p.range]);
  const total = [...counts.values()].reduce((s, x) => s + x, 0);
  return (
    <div className="card">
      <div className="mall-card-h"><h3>Order status</h3><CardFilter p={p} /></div>
      {counts.size === 0 ? <p className="muted">No orders in this period.</p> : (
        <div style={{ marginTop: 8 }}>
          {[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([st, n]) => (
            <div key={st} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>{STATUS_LABEL[st] ?? st}</span>
                <strong>{n}</strong>
              </div>
              <div style={{ height: 8, borderRadius: 5, background: '#f0e7d2', overflow: 'hidden' }}>
                <div style={{ width: `${(n / (total || 1)) * 100}%`, height: '100%', background: STATUS_COLOR[st] ?? '#c8871a' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TopProductsCard({ orders }: { orders: Row[] }) {
  const p = usePeriod();
  const top = useMemo(() => {
    const byProduct = new Map<string, { title: string; qty: number; rev: number }>();
    for (const o of orders) {
      if (!(PAID.has(o.status as string) && inRange(o, p.range))) continue;
      for (const it of ((o.items as Row[]) ?? [])) {
        const key = (it.productId as string) || (it.title as string) || '?';
        const cur = byProduct.get(key) ?? { title: (it.title as string) || 'Product', qty: 0, rev: 0 };
        cur.qty += (it.qty as number) || 0;
        cur.rev += (it.lineTotalPaise as number) || 0;
        byProduct.set(key, cur);
      }
    }
    return [...byProduct.values()].sort((a, b) => b.qty - a.qty).slice(0, 6);
  }, [orders, p.range]);
  const maxTop = Math.max(1, ...top.map((t) => t.qty));
  return (
    <div className="card">
      <div className="mall-card-h"><h3>Top products</h3><CardFilter p={p} /></div>
      {top.length === 0 ? <p className="muted">No sales in this period.</p> : (
        <div style={{ height: Math.max(120, top.length * 44) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={top} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
              <XAxis type="number" hide domain={[0, maxTop]} />
              <YAxis type="category" dataKey="title" width={120} tick={{ fontSize: 11, fill: '#5a4b2e' }} stroke="#e7d9b8" />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e7d9b8', borderRadius: 10, color: '#5a3d0c' }}
                formatter={(v: number, _n, pl) => [`${v} units · ${formatPaise((pl.payload as { rev: number }).rev)}`, 'Sold']} />
              <Bar dataKey="qty" radius={[0, 6, 6, 0]} barSize={16}>
                {top.map((_, i) => <Cell key={i} fill={i === 0 ? '#c8871a' : '#e0b95f'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function RecentOrdersCard({ orders }: { orders: Row[] }) {
  const p = usePeriod();
  const inWindow = useMemo(() => orders.filter((o) => inRange(o, p.range)), [orders, p.range]);
  return (
    <div className="card">
      <div className="mall-card-h">
        <h3>Recent orders</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CardFilter p={p} />
          <Link href="/store-orders" className="mall-link">View all →</Link>
        </div>
      </div>
      {inWindow.length === 0 ? <p className="muted">No orders in this period.</p> : (
        <div>
          {inWindow.slice(0, 7).map((o) => (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid #f0e7d2' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 13 }}>{(o.orderNo as string) || o.id}</strong>
                <span className="muted" style={{ fontSize: 12 }}> · {(o.itemCount as number) ?? 0} item{(o.itemCount as number) === 1 ? '' : 's'}</span>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999, color: '#fff', background: STATUS_COLOR[o.status as string] ?? '#b9a98a' }}>
                {STATUS_LABEL[o.status as string] ?? (o.status as string)}
              </span>
              <strong style={{ fontSize: 13, minWidth: 62, textAlign: 'right' }}>{formatPaise((o.totalPaise as number) || 0)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, accent, delta }: {
  label: string; value: string | number; sub?: string; accent?: string; delta?: number | 'new' | null;
}) {
  return (
    <div className="mall-kpi">
      <div className="mall-kpi__l">{label}</div>
      <div className="mall-kpi__v" style={{ color: accent ?? '#33291a' }}>{value}</div>
      {delta === 'new' ? <span className="mall-kpi__d up">▲ new</span>
        : typeof delta === 'number' ? (
          <span className={`mall-kpi__d ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}`}>
            {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta)}% <span className="mall-kpi__dsub">vs prev</span>
          </span>
        ) : null}
      {sub && <div className="mall-kpi__s">{sub}</div>}
    </div>
  );
}
function MiniStat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${warn ? '#f0c9b0' : '#efe3c8'}`, borderRadius: 12, padding: '12px 14px' }}>
      <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 3, color: warn ? '#c4562e' : '#33291a' }}>{value}</div>
    </div>
  );
}
