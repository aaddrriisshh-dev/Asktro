'use client';

import { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection } from '@/lib/hooks';
import { formatPaise, rupeesToPaise } from '@/lib/format';

export default function PlansPage() {
  const { rows, loading } = useCollection('rechargePlans');
  const [f, setF] = useState({ amount: '', bonus: '', order: '' });

  async function add() {
    const amount = rupeesToPaise(Number(f.amount));
    if (amount <= 0) return alert('Enter a valid amount.');
    await addDoc(collection(db, 'rechargePlans'), {
      amount,
      walletCredit: amount,
      bonus: rupeesToPaise(Number(f.bonus) || 0),
      popular: false,
      recommended: false,
      displayOrder: Number(f.order) || 0,
      active: true,
    });
    setF({ amount: '', bonus: '', order: '' });
  }

  async function toggle(id: string, field: string, value: boolean) {
    await updateDoc(doc(db, 'rechargePlans', id), { [field]: !value });
  }

  return (
    <div>
      <h1>Recharge Plans</h1>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>New plan</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input className="input" placeholder="Amount ₹" style={{ width: 140 }} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <input className="input" placeholder="Bonus ₹" style={{ width: 140 }} value={f.bonus} onChange={(e) => setF({ ...f, bonus: e.target.value })} />
          <input className="input" placeholder="Order" style={{ width: 100 }} value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} />
          <button className="btn" onClick={add}>Add plan</button>
        </div>
      </div>
      <div className="card">
        {loading ? <p className="muted">Loading…</p> : (
          <table>
            <thead>
              <tr><th>Amount</th><th>Bonus</th><th>Total</th><th>Popular</th><th>Recommended</th><th>Active</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{formatPaise(p.amount)}</td>
                  <td>{formatPaise(p.bonus)}</td>
                  <td>{formatPaise((p.walletCredit ?? p.amount ?? 0) + (p.bonus ?? 0))}</td>
                  <td><button className="btn sm secondary" onClick={() => toggle(p.id, 'popular', p.popular)}>{p.popular ? 'Yes' : 'No'}</button></td>
                  <td><button className="btn sm secondary" onClick={() => toggle(p.id, 'recommended', p.recommended)}>{p.recommended ? 'Yes' : 'No'}</button></td>
                  <td><button className="btn sm secondary" onClick={() => toggle(p.id, 'active', p.active)}>{p.active ? 'On' : 'Off'}</button></td>
                  <td><button className="btn sm danger" onClick={() => deleteDoc(doc(db, 'rechargePlans', p.id))}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
