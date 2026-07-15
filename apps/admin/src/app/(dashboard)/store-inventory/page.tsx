'use client';

import { useMemo, useState } from 'react';
import { doc, orderBy, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection, Row } from '@/lib/hooks';
import { formatPaise } from '@/lib/format';

type Filter = 'all' | 'low' | 'out' | 'active';
const LOW = 5;

/** Inventory — the store's stock control room. Every product's on-hand count in
 *  one editable table: adjust stock inline, watch low/out badges, and see the
 *  total money sitting on the shelf. Writes straight to storeProducts.stock. */
export default function InventoryPage() {
  const { rows: products } = useCollection('storeProducts', [orderBy('title', 'asc')]);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [restockId, setRestockId] = useState<string | null>(null);
  const [restockVal, setRestockVal] = useState('');

  const stockOf = (p: Row) => (typeof p.stock === 'number' ? (p.stock as number) : 0);

  const stats = useMemo(() => {
    let value = 0, units = 0, low = 0, out = 0, active = 0;
    for (const p of products) {
      const s = stockOf(p);
      value += s * ((p.pricePaise as number) || 0);
      units += s;
      if (p.active !== false) active += 1;
      if (s <= 0) out += 1;
      else if (s <= LOW) low += 1;
    }
    return { value, units, low, out, active, total: products.length };
  }, [products]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter((p) => {
      const s = stockOf(p);
      if (filter === 'low' && !(s > 0 && s <= LOW)) return false;
      if (filter === 'out' && s > 0) return false;
      if (filter === 'active' && p.active === false) return false;
      if (needle) {
        const hay = `${(p.title as string) ?? ''} ${(p.sku as string) ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [products, filter, q]);

  async function commit(p: Row) {
    const raw = draft[p.id];
    if (raw == null) return;
    const next = Math.max(0, Math.round(Number(raw)));
    if (!Number.isFinite(next) || next === stockOf(p)) {
      setDraft((d) => { const n = { ...d }; delete n[p.id]; return n; });
      return;
    }
    setSavingId(p.id);
    try {
      await updateDoc(doc(db, 'storeProducts', p.id), { stock: next, updatedAt: serverTimestamp() });
      setDraft((d) => { const n = { ...d }; delete n[p.id]; return n; });
    } catch (e) { alert('Failed to save stock: ' + (e as Error).message); }
    finally { setSavingId(null); }
  }

  async function bump(p: Row, by: number) {
    const cur = draft[p.id] != null ? Number(draft[p.id]) : stockOf(p);
    const next = Math.max(0, cur + by);
    setSavingId(p.id);
    try {
      await updateDoc(doc(db, 'storeProducts', p.id), { stock: next, updatedAt: serverTimestamp() });
      setDraft((d) => { const n = { ...d }; delete n[p.id]; return n; });
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setSavingId(null); }
  }

  // Restock — a shipment arrived: ADD the received units to what's on hand.
  async function addStock(p: Row) {
    const add = Math.round(Number(restockVal));
    if (!Number.isFinite(add) || add <= 0) { alert('Enter how many units arrived.'); return; }
    setSavingId(p.id);
    try {
      await updateDoc(doc(db, 'storeProducts', p.id), { stock: Math.max(0, stockOf(p) + add), updatedAt: serverTimestamp() });
      setRestockId(null); setRestockVal('');
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setSavingId(null); }
  }

  const chips: { k: Filter; label: string; n: number }[] = [
    { k: 'all', label: 'All', n: stats.total },
    { k: 'active', label: 'Live', n: stats.active },
    { k: 'low', label: 'Low stock', n: stats.low },
    { k: 'out', label: 'Out of stock', n: stats.out },
  ];

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Inventory</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Live stock for every Asktro Mall product. Type in the box to <strong>set exact stock</strong>, use −/+ for small fixes, or hit
        {' '}<strong>Restock</strong> when a new shipment arrives to add the units received. Everything saves instantly.
      </p>

      {/* Summary */}
      <div className="mall-kpis" style={{ marginTop: 16 }}>
        <div className="mall-kpi">
          <div className="mall-kpi__l">Stock value</div>
          <div className="mall-kpi__v" style={{ color: '#1e9e63' }}>{formatPaise(stats.value)}</div>
          <div className="mall-kpi__s">{stats.units} units on hand</div>
        </div>
        <div className="mall-kpi">
          <div className="mall-kpi__l">Live products</div>
          <div className="mall-kpi__v">{stats.active}</div>
          <div className="mall-kpi__s">{stats.total} total</div>
        </div>
        <div className="mall-kpi">
          <div className="mall-kpi__l">Low stock (≤{LOW})</div>
          <div className="mall-kpi__v" style={{ color: stats.low ? '#c8871a' : '#33291a' }}>{stats.low}</div>
          <div className="mall-kpi__s">need restock soon</div>
        </div>
        <div className="mall-kpi">
          <div className="mall-kpi__l">Out of stock</div>
          <div className="mall-kpi__v" style={{ color: stats.out ? '#c4562e' : '#33291a' }}>{stats.out}</div>
          <div className="mall-kpi__s">not sellable</div>
        </div>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginTop: 4 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {chips.map((c) => (
              <button key={c.k} onClick={() => setFilter(c.k)}
                className={`btn sm ${filter === c.k ? '' : 'secondary'}`}>
                {c.label} <span style={{ opacity: 0.7 }}>· {c.n}</span>
              </button>
            ))}
          </div>
          <input className="input" placeholder="Search name or SKU…" value={q} onChange={(e) => setQ(e.target.value)}
            style={{ marginLeft: 'auto', maxWidth: 260 }} />
        </div>

        {rows.length === 0 ? <p className="muted">No products match.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th style={{ textAlign: 'right' }}>Price</th>
                  <th style={{ textAlign: 'center', width: 200 }}>Set stock</th>
                  <th style={{ textAlign: 'center', width: 190 }}>Restock (shipment in)</th>
                  <th style={{ textAlign: 'right' }}>Stock value</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const s = stockOf(p);
                  const dirty = draft[p.id] != null && Number(draft[p.id]) !== s;
                  const badge = s <= 0 ? { t: 'OUT', c: '#c4562e', bg: '#fbe6dd' }
                    : s <= LOW ? { t: 'LOW', c: '#b8860b', bg: '#fbf1d8' }
                      : { t: 'OK', c: '#1e9e63', bg: '#e3f5ec' };
                  return (
                    <tr key={p.id}>
                      <td data-label="Product">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {Array.isArray(p.images) && p.images[0]
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={p.images[0] as string} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                            : <div style={{ width: 34, height: 34, borderRadius: 8, background: '#f0e7d2', flexShrink: 0 }} />}
                          <span style={{ fontWeight: 600 }}>{(p.title as string) || 'Untitled'}</span>
                        </div>
                      </td>
                      <td data-label="SKU" className="muted" style={{ fontSize: 12.5 }}>{(p.sku as string) || '—'}</td>
                      <td data-label="Price" style={{ textAlign: 'right' }}>{formatPaise((p.pricePaise as number) || 0)}</td>
                      <td data-label="Set stock" style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <button className="btn sm secondary" disabled={savingId === p.id || s <= 0}
                            onClick={() => bump(p, -1)} style={{ padding: '4px 9px' }}>−</button>
                          <input className="input" type="number" min={0} value={draft[p.id] ?? String(s)}
                            onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                            onBlur={() => commit(p)}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            title="Type the exact stock on hand and press Enter"
                            style={{ width: 66, textAlign: 'center', padding: '5px 6px',
                              borderColor: dirty ? '#c8871a' : undefined }} />
                          <button className="btn sm secondary" disabled={savingId === p.id}
                            onClick={() => bump(p, 1)} style={{ padding: '4px 9px' }}>+</button>
                        </div>
                        {dirty && <div style={{ fontSize: 10.5, color: '#c8871a', marginTop: 3 }}>press Enter to save</div>}
                      </td>
                      <td data-label="Restock" style={{ textAlign: 'center' }}>
                        {restockId === p.id ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <input className="input" type="number" min={1} autoFocus placeholder="+ units"
                              value={restockVal} onChange={(e) => setRestockVal(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') addStock(p); if (e.key === 'Escape') { setRestockId(null); setRestockVal(''); } }}
                              style={{ width: 72, textAlign: 'center', padding: '5px 6px' }} />
                            <button className="btn sm" disabled={savingId === p.id} onClick={() => addStock(p)} style={{ padding: '4px 10px' }}>Add</button>
                            <button className="btn sm secondary" onClick={() => { setRestockId(null); setRestockVal(''); }} style={{ padding: '4px 8px' }}>×</button>
                          </div>
                        ) : (
                          <button className="btn sm secondary" onClick={() => { setRestockId(p.id); setRestockVal(''); }}>＋ Restock</button>
                        )}
                      </td>
                      <td data-label="Stock value" style={{ textAlign: 'right' }} className="muted">
                        {formatPaise(s * ((p.pricePaise as number) || 0))}
                      </td>
                      <td data-label="Status" style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999, color: badge.c, background: badge.bg }}>
                          {badge.t}
                        </span>
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
