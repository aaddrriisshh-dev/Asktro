'use client';

import { useState } from 'react';
import { deleteDoc, doc, orderBy, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection, Row } from '@/lib/hooks';
import { formatPaise } from '@/lib/format';

const empty = {
  code: '', type: 'percent', value: '', minCart: '', maxDisc: '',
  freeShipping: false, usageLimit: '', active: true, expires: '',
};

/** Discounts — Asktro Mall coupon codes. Applied + re-validated server-side at
 *  checkout; the doc id is the code, so validation is an O(1) lookup. */
export default function DiscountsPage() {
  const { rows } = useCollection('storeCoupons', [orderBy('code', 'asc')]);
  const [f, setF] = useState({ ...empty });
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  function edit(r: Row) {
    setEditId(r.id);
    setF({
      code: (r.code as string) ?? r.id,
      type: (r.type as string) ?? 'percent',
      value: r.type === 'percent' ? String(r.value ?? '') : String(((r.value as number) ?? 0) / 100),
      minCart: r.minCartPaise ? String((r.minCartPaise as number) / 100) : '',
      maxDisc: r.maxDiscountPaise ? String((r.maxDiscountPaise as number) / 100) : '',
      freeShipping: r.freeShipping === true,
      usageLimit: r.usageLimit ? String(r.usageLimit) : '',
      active: r.active !== false,
      expires: r.expiresAt ? new Date((r.expiresAt as Timestamp).toMillis()).toISOString().slice(0, 10) : '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function reset() { setEditId(null); setF({ ...empty }); }

  async function save() {
    const code = f.code.trim().toUpperCase();
    if (!code) return alert('Enter a coupon code.');
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return alert('Code must be 3–20 letters/numbers (no spaces).');
    const val = Number(f.value);
    if (!val || val <= 0) return alert('Enter the discount value.');
    if (f.type === 'percent' && val > 90) return alert('Percent discount looks too high (max 90%).');
    setBusy(true);
    try {
      await setDoc(doc(db, 'storeCoupons', code), {
        code,
        type: f.type,
        value: f.type === 'percent' ? Math.round(val) : Math.round(val * 100), // fixed stored in paise
        minCartPaise: f.minCart.trim() ? Math.round(Number(f.minCart) * 100) : 0,
        maxDiscountPaise: f.maxDisc.trim() ? Math.round(Number(f.maxDisc) * 100) : 0,
        freeShipping: f.freeShipping,
        usageLimit: f.usageLimit.trim() ? Math.max(0, Math.round(Number(f.usageLimit))) : 0,
        active: f.active,
        expiresAt: f.expires ? Timestamp.fromDate(new Date(`${f.expires}T23:59:59`)) : null,
        updatedAt: serverTimestamp(),
        ...(editId ? {} : { usedCount: 0, createdAt: serverTimestamp() }),
      }, { merge: true });
      reset();
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Discounts</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Coupon codes for Asktro Mall checkout. The discount is re-checked on the server when an order is placed.
      </p>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>{editId ? `Edit “${editId}”` : 'New coupon'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="af"><span>Code *</span>
            <input className="input" placeholder="NAVRATRI20" value={f.code} disabled={!!editId}
              onChange={(e) => set('code', e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} />
          </label>
          <label className="af"><span>Type</span>
            <select className="input" value={f.type} onChange={(e) => set('type', e.target.value)}>
              <option value="percent">% off</option>
              <option value="fixed">Flat ₹ off</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
          <label className="af"><span>{f.type === 'percent' ? 'Percent (%)' : 'Amount (₹)'} *</span>
            <input className="input" type="number" min={0} placeholder={f.type === 'percent' ? '20' : '100'} value={f.value} onChange={(e) => set('value', e.target.value)} />
          </label>
          <label className="af"><span>Min cart (₹)</span>
            <input className="input" type="number" min={0} placeholder="0" value={f.minCart} onChange={(e) => set('minCart', e.target.value)} />
          </label>
          <label className="af"><span>Max discount (₹){f.type === 'percent' ? '' : ' — n/a'}</span>
            <input className="input" type="number" min={0} placeholder="cap" value={f.maxDisc} disabled={f.type !== 'percent'} onChange={(e) => set('maxDisc', e.target.value)} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <label className="af"><span>Usage limit (0 = unlimited)</span>
            <input className="input" type="number" min={0} placeholder="0" value={f.usageLimit} onChange={(e) => set('usageLimit', e.target.value)} />
          </label>
          <label className="af"><span>Expires on (optional)</span>
            <input className="input" type="date" value={f.expires} onChange={(e) => set('expires', e.target.value)} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap', fontSize: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <input type="checkbox" checked={f.freeShipping} onChange={(e) => set('freeShipping', e.target.checked)} /> Also free shipping
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Active
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Add coupon'}</button>
          {editId && <button className="btn secondary" onClick={reset}>Cancel</button>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Coupons ({rows.length})</h3>
        {rows.length === 0 && <p className="muted">No coupons yet.</p>}
        {rows.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border,#eee)' }}>
            <div style={{ flex: 1 }}>
              <strong style={{ letterSpacing: 0.5 }}>{r.code as string}</strong>{' '}
              <span className="muted" style={{ fontSize: 13 }}>
                · {r.type === 'percent' ? `${r.value}% off` : `${formatPaise(r.value as number)} off`}
                {r.freeShipping ? ' · free ship' : ''}
                {(r.minCartPaise as number) ? ` · min ${formatPaise(r.minCartPaise as number)}` : ''}
                {' · used '}{(r.usedCount as number) ?? 0}{(r.usageLimit as number) ? `/${r.usageLimit}` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button className="btn sm secondary" onClick={() => edit(r)}>Edit</button>
              <button className={`btn sm ${r.active !== false ? 'secondary' : ''}`}
                onClick={() => updateDoc(doc(db, 'storeCoupons', r.id), { active: r.active === false })}>
                {r.active !== false ? 'Active' : 'Off'}
              </button>
              <button className="btn sm secondary" onClick={() => confirm(`Delete coupon ${r.id}?`) && deleteDoc(doc(db, 'storeCoupons', r.id))}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
