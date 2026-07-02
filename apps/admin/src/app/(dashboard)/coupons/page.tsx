'use client';

import { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection } from '@/lib/hooks';
import { formatPaise, rupeesToPaise } from '@/lib/format';

export default function CouponsPage() {
  const { rows, loading } = useCollection('coupons');
  const [f, setF] = useState({ code: '', type: 'flat', amount: '', percentage: '', minRecharge: '', maxDiscount: '', usageLimit: '', perUserOnce: true, expiry: '' });

  function set(k: string, v: string | boolean) { setF((s) => ({ ...s, [k]: v })); }

  async function add() {
    if (!f.code.trim()) return alert('Code is required.');
    await addDoc(collection(db, 'coupons'), {
      code: f.code.trim().toUpperCase(),
      type: f.type,
      amount: f.type === 'flat' ? rupeesToPaise(Number(f.amount) || 0) : 0,
      percentage: f.type === 'percentage' ? Number(f.percentage) || 0 : 0,
      maxDiscount: rupeesToPaise(Number(f.maxDiscount) || 0),
      minimumRecharge: rupeesToPaise(Number(f.minRecharge) || 0),
      usageLimit: Number(f.usageLimit) || 0,
      usedCount: 0,
      perUserOnce: f.perUserOnce,
      expiry: f.expiry ? Timestamp.fromDate(new Date(f.expiry)) : null,
      active: true,
    });
    setF({ code: '', type: 'flat', amount: '', percentage: '', minRecharge: '', maxDiscount: '', usageLimit: '', perUserOnce: true, expiry: '' });
  }

  return (
    <div>
      <h1>Coupons</h1>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>New coupon</h3>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <input className="input" placeholder="CODE" value={f.code} onChange={(e) => set('code', e.target.value)} />
          <select className="input" value={f.type} onChange={(e) => set('type', e.target.value)}>
            <option value="flat">Flat (₹)</option>
            <option value="percentage">Percentage (%)</option>
          </select>
          {f.type === 'flat'
            ? <input className="input" placeholder="Amount ₹" value={f.amount} onChange={(e) => set('amount', e.target.value)} />
            : <input className="input" placeholder="Percentage %" value={f.percentage} onChange={(e) => set('percentage', e.target.value)} />}
          <input className="input" placeholder="Min recharge ₹" value={f.minRecharge} onChange={(e) => set('minRecharge', e.target.value)} />
          <input className="input" placeholder="Max discount ₹" value={f.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)} />
          <input className="input" placeholder="Usage limit (0 = ∞)" value={f.usageLimit} onChange={(e) => set('usageLimit', e.target.value)} />
          <input className="input" type="date" value={f.expiry} onChange={(e) => set('expiry', e.target.value)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={f.perUserOnce} onChange={(e) => set('perUserOnce', e.target.checked)} /> One use per user
          </label>
        </div>
        <div style={{ marginTop: 12 }}><button className="btn" onClick={add}>Add coupon</button></div>
      </div>
      <div className="card">
        {loading ? <p className="muted">Loading…</p> : (
          <table>
            <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Used</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.code}</b></td>
                  <td>{c.type}</td>
                  <td>{c.type === 'percentage' ? `${c.percentage}%` : formatPaise(c.amount)}</td>
                  <td>{c.usedCount ?? 0}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                  <td><button className="btn sm secondary" onClick={() => updateDoc(doc(db, 'coupons', c.id), { active: !c.active })}>{c.active ? 'On' : 'Off'}</button></td>
                  <td><button className="btn sm danger" onClick={() => deleteDoc(doc(db, 'coupons', c.id))}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
