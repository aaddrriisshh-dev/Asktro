'use client';

import { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection } from '@/lib/hooks';
import { useAuth } from '@/lib/auth-context';
import { formatPaise, rupeesToPaise } from '@/lib/format';

const AUDIENCES = [
  { key: 'all', label: 'All Users' },
  { key: 'unpaid', label: 'Unpaid Users' },
  { key: 'paid', label: 'Paid Users' },
] as const;
const AUD_LABEL: Record<string, string> = { all: 'All Users', unpaid: 'Unpaid Users', paid: 'Paid Users' };

function genCode() {
  const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = 'ASK';
  for (let i = 0; i < 5; i++) c += s[Math.floor(Math.random() * s.length)];
  return c;
}

export default function CouponsPage() {
  const { rows, loading } = useCollection('coupons');
  const { user, adminName } = useAuth();
  const [f, setF] = useState({ code: '', amount: '', bonus: '', minRecharge: '', usageLimit: '', audience: 'all', image: '', expiry: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function push() {
    if (!f.code.trim()) return alert('A coupon code is required (use Generate).');
    if (!f.amount && !f.bonus) return alert('Set an amount and/or a bonus.');
    setBusy(true);
    try {
      await addDoc(collection(db, 'coupons'), {
        code: f.code.trim().toUpperCase(),
        type: 'flat',
        amount: rupeesToPaise(Number(f.amount) || 0),
        bonus: rupeesToPaise(Number(f.bonus) || 0),
        percentage: 0,
        minimumRecharge: rupeesToPaise(Number(f.minRecharge) || 0),
        maxDiscount: 0,
        usageLimit: Number(f.usageLimit) || 0,
        usedCount: 0,
        perUserOnce: true,
        audience: f.audience,
        image: f.image.trim() || null,
        expiry: f.expiry ? Timestamp.fromDate(new Date(f.expiry)) : null,
        active: true,
        createdBy: user?.uid ?? null,
        createdByName: adminName || null,
        createdAt: Timestamp.now(),
      });
      setF({ code: '', amount: '', bonus: '', minRecharge: '', usageLimit: '', audience: 'all', image: '', expiry: '' });
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Coupons</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Wallet offers targeted by audience. Generate a code, set the reward, then Commit &amp; Push.</p>

      <div className="card" style={{ marginTop: 16, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>New coupon</h3>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <label className="af"><span>Coupon code</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="input" placeholder="ASK-XXXXX" value={f.code} onChange={(e) => set('code', e.target.value)} />
              <button className="btn sm secondary" onClick={() => set('code', genCode())}>Generate</button>
            </div>
          </label>
          <label className="af"><span>Amount to wallet (₹)</span><input className="input" placeholder="100" value={f.amount} onChange={(e) => set('amount', e.target.value)} /></label>
          <label className="af"><span>Bonus (₹, free credit)</span><input className="input" placeholder="100" value={f.bonus} onChange={(e) => set('bonus', e.target.value)} /></label>
          <label className="af"><span>Min recharge (₹, optional)</span><input className="input" placeholder="0" value={f.minRecharge} onChange={(e) => set('minRecharge', e.target.value)} /></label>
          <label className="af"><span>Usage limit (0 = ∞)</span><input className="input" placeholder="0" value={f.usageLimit} onChange={(e) => set('usageLimit', e.target.value)} /></label>
          <label className="af"><span>Expiry date</span><input className="input" type="date" value={f.expiry} onChange={(e) => set('expiry', e.target.value)} /></label>
          <label className="af"><span>Image URL (optional)</span><input className="input" placeholder="https://…" value={f.image} onChange={(e) => set('image', e.target.value)} /></label>
        </div>
        <p className="af-label">Placement / audience</p>
        <div className="pickrow">
          {AUDIENCES.map((a) => (
            <button key={a.key} type="button" className={`pickchip${f.audience === a.key ? ' on' : ''}`} onClick={() => set('audience', a.key)}>{a.label}</button>
          ))}
        </div>
        <div style={{ marginTop: 14 }}><button className="btn" disabled={busy} onClick={push}>{busy ? 'Pushing…' : '⚡ Commit & Push'}</button></div>
      </div>

      <div className="card">
        {loading ? <p className="muted">Loading…</p> : rows.length === 0 ? <p className="muted">No coupons yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Code</th><th>Reward</th><th>Audience</th><th>Used</th><th>Added by</th><th>Active</th><th></th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td><b>{c.code}</b></td>
                    <td>{formatPaise(c.amount)}{c.bonus ? ` + ${formatPaise(c.bonus)} bonus` : ''}</td>
                    <td><span className="badge amber">{AUD_LABEL[c.audience] ?? 'All Users'}</span></td>
                    <td>{c.usedCount ?? 0}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{(c.createdByName as string) || '—'}</td>
                    <td><button className={`btn sm ${c.active ? 'secondary' : ''}`} onClick={() => updateDoc(doc(db, 'coupons', c.id), { active: !c.active })}>{c.active ? 'On' : 'Off'}</button></td>
                    <td><button className="btn sm danger" onClick={() => { if (confirm('Delete this coupon?')) deleteDoc(doc(db, 'coupons', c.id)); }}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
