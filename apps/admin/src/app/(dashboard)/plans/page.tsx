'use client';

import { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection, Row } from '@/lib/hooks';
import { formatPaise, rupeesToPaise } from '@/lib/format';

export default function PlansPage() {
  const { rows, loading } = useCollection('rechargePlans');
  const [f, setF] = useState({ amount: '', bonus: '', order: '', type: 'regular' });

  async function add() {
    const amount = rupeesToPaise(Number(f.amount));
    if (amount <= 0) return alert('Enter a valid amount.');
    await addDoc(collection(db, 'rechargePlans'), {
      amount,
      walletCredit: amount,
      bonus: rupeesToPaise(Number(f.bonus) || 0),
      planType: f.type,
      popular: false,
      recommended: false,
      displayOrder: Number(f.order) || 0,
      active: true,
    });
    setF({ amount: '', bonus: '', order: '', type: 'regular' });
  }

  async function toggle(id: string, field: string, value: boolean) {
    await updateDoc(doc(db, 'rechargePlans', id), { [field]: !value });
  }

  async function switchType(id: string, current: string | undefined) {
    await updateDoc(doc(db, 'rechargePlans', id), { planType: (current ?? 'regular') === 'offer' ? 'regular' : 'offer' });
  }

  const isOffer = (p: Row) => ((p.planType as string) ?? 'regular') === 'offer';
  const regular = rows.filter((p) => !isOffer(p));
  const offers = rows.filter((p) => isOffer(p));

  function table(list: typeof rows) {
    if (list.length === 0) return <p className="muted" style={{ margin: '6px 0' }}>None yet.</p>;
    return (
      <table className="cardify">
        <thead>
          <tr><th>Amount</th><th>Bonus</th><th>Total</th><th>Type</th><th>Popular</th><th>Recommended</th><th>Active</th><th></th></tr>
        </thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id}>
              <td data-label="Amount">{formatPaise(p.amount)}</td>
              <td data-label="Bonus">{formatPaise(p.bonus)}</td>
              <td data-label="Total">{formatPaise((p.walletCredit ?? p.amount ?? 0) + (p.bonus ?? 0))}</td>
              <td data-label="Type"><button className={`btn sm ${isOffer(p) ? '' : 'secondary'}`} onClick={() => switchType(p.id, p.planType)}>{isOffer(p) ? '🎁 Offer' : 'Regular'}</button></td>
              <td data-label="Popular"><button className="btn sm secondary" onClick={() => toggle(p.id, 'popular', p.popular)}>{p.popular ? 'Yes' : 'No'}</button></td>
              <td data-label="Recommended"><button className="btn sm secondary" onClick={() => toggle(p.id, 'recommended', p.recommended)}>{p.recommended ? 'Yes' : 'No'}</button></td>
              <td data-label="Active"><button className="btn sm secondary" onClick={() => toggle(p.id, 'active', p.active)}>{p.active ? 'On' : 'Off'}</button></td>
              <td data-label=""><button className="btn sm danger" onClick={() => deleteDoc(doc(db, 'rechargePlans', p.id))}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Recharge Plans</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        <b>Regular</b> plans show on the app&apos;s recharge screen. <b>Offer</b> plans are hidden there and only appear when a user taps a <b>Recharge banner</b> tied to them.
      </p>

      <div className="card" style={{ margin: '16px 0 20px' }}>
        <h3 style={{ marginTop: 0 }}>New plan</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" placeholder="Amount ₹" style={{ width: 130 }} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <input className="input" placeholder="Bonus ₹" style={{ width: 130 }} value={f.bonus} onChange={(e) => setF({ ...f, bonus: e.target.value })} />
          <input className="input" placeholder="Order" style={{ width: 90 }} value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} />
          <select className="input" style={{ width: 150 }} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="regular">Regular</option>
            <option value="offer">🎁 Offer (banner-only)</option>
          </select>
          <button className="btn" onClick={add}>Add plan</button>
        </div>
      </div>

      {loading ? <p className="muted">Loading…</p> : (
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          <div className="card sess-col" style={{ borderTop: '3px solid var(--primary)' }}>
            <div className="sess-col-head">
              <h3 className="celeste" style={{ margin: 0 }}>Regular plans</h3>
              <span className="udet-total">{regular.length}</span>
            </div>
            <p className="muted" style={{ margin: '4px 0 10px', fontSize: 12 }}>Shown on the app&apos;s recharge screen.</p>
            <div style={{ overflowX: 'auto' }}>{table(regular)}</div>
          </div>
          <div className="card sess-col" style={{ borderTop: '3px solid var(--gold)' }}>
            <div className="sess-col-head">
              <h3 className="celeste" style={{ margin: 0 }}>🎁 Offer plans</h3>
              <span className="udet-total">{offers.length}</span>
            </div>
            <p className="muted" style={{ margin: '4px 0 10px', fontSize: 12 }}>Banner-only — hidden from the recharge screen.</p>
            <div style={{ overflowX: 'auto' }}>{table(offers)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
