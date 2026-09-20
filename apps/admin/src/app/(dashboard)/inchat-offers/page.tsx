'use client';

import { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection, Row } from '@/lib/hooks';
import { formatPaise, rupeesToPaise } from '@/lib/format';
import { MobileSection } from '@/components/MobileSection';

/** In-chat Offers = recharge offers shown ONLY inside the chat's "out of balance"
 *  prompt (its "View offers" button). Stored in `rechargePlans` with
 *  planType 'inchat', so the server credits them like any plan (charge = Amount,
 *  wallet = Amount + Bonus), but the app hides them from the normal recharge grid
 *  and the "offers & plans" screen — they surface only from that chat prompt.
 *  Unlike Welcome Offers these are NOT first-recharge-only: a user whose balance
 *  ran out mid-chat can take them any time. */
export default function InchatOffersPage() {
  const { rows, loading } = useCollection('rechargePlans');
  const [f, setF] = useState({ title: '', amount: '', bonus: '', order: '' });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const offers = rows
    .filter((p) => ((p.planType as string) ?? '') === 'inchat')
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || (a.amount ?? 0) - (b.amount ?? 0));

  async function add() {
    const amount = rupeesToPaise(Number(f.amount));
    if (amount <= 0) return alert('Enter a valid recharge amount (what the user pays).');
    const bonus = rupeesToPaise(Number(f.bonus) || 0);
    setSaving(true);
    try {
      await addDoc(collection(db, 'rechargePlans'), {
        title: f.title.trim() || 'In-chat offer',
        amount, // what the user is charged
        walletCredit: amount, // real cash credited = the amount paid
        bonus, // the extra; total in wallet = amount + bonus
        planType: 'inchat',
        popular: false,
        recommended: false,
        displayOrder: Number(f.order) || 0,
        active: true,
      });
      setF({ title: '', amount: '', bonus: '', order: '' });
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setSaving(false); }
  }

  async function toggle(id: string, field: string, value: boolean) {
    await updateDoc(doc(db, 'rechargePlans', id), { [field]: !value });
  }

  async function remove(id: string) {
    if (!confirm('Delete this in-chat offer permanently?')) return;
    await deleteDoc(doc(db, 'rechargePlans', id));
  }

  async function copyId(id: string) {
    try { await navigator.clipboard.writeText(id); setCopied(id); setTimeout(() => setCopied(null), 1200); }
    catch { /* clipboard blocked — the id is still visible */ }
  }

  const total = (p: Row) => (p.walletCredit ?? p.amount ?? 0) + (p.bonus ?? 0);

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>In-chat Offers</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        Recharge offers shown <b>inside the chat</b> when a user runs out of balance and taps
        &ldquo;View offers&rdquo;. They are <b>hidden</b> from the normal recharge screen and the
        &ldquo;offers &amp; plans&rdquo; section. Example: Pay ₹50, Bonus ₹100 → the user pays ₹50 and gets
        <b> ₹150</b> in their wallet (&ldquo;recharge ₹50, get ₹100 extra&rdquo;).
      </p>

      <MobileSection title="New in-chat offer" defaultOpen={true}>
      <div className="card" style={{ margin: '16px 0 20px' }}>
        <h3 style={{ marginTop: 0 }}>New in-chat offer</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Name (for you)</span>
            <input className="input" placeholder="e.g. Recharge 50 get 150" style={{ width: 220 }}
              value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Pay ₹ (charged)</span>
            <input className="input" placeholder="e.g. 50" style={{ width: 120 }}
              value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Bonus ₹ (extra)</span>
            <input className="input" placeholder="e.g. 100" style={{ width: 120 }}
              value={f.bonus} onChange={(e) => setF({ ...f, bonus: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Order</span>
            <input className="input" placeholder="0" style={{ width: 80 }}
              value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} />
          </label>
          <button className="btn" onClick={add} disabled={saving} style={{ marginBottom: 2 }}>
            {saving ? 'Adding…' : 'Add offer'}
          </button>
        </div>
        <p className="muted" style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.5 }}>
          <b>Pay</b> = what the user is charged. <b>Total in wallet</b> = Pay + Bonus. The app shows the
          user &ldquo;+₹{'{bonus}'} extra&rdquo; on the tile so it&apos;s clear they get more than they pay.
        </p>
      </div>
      </MobileSection>

      {loading ? <p className="muted">Loading…</p> : (
        <MobileSection title="Your in-chat offers" defaultOpen={true}>
        <div className="card sess-col" style={{ borderTop: '3px solid var(--gold)' }}>
          <div className="sess-col-head">
            <h3 className="celeste" style={{ margin: 0 }}>💬 In-chat offers</h3>
            <span className="udet-total">{offers.length}</span>
          </div>
          <p className="muted" style={{ margin: '4px 0 10px', fontSize: 12 }}>
            Shown only in the chat &ldquo;out of balance&rdquo; prompt. If none are active, &ldquo;View offers&rdquo; opens the normal recharge screen.
          </p>
          {offers.length === 0 ? (
            <p className="muted" style={{ margin: '6px 0' }}>None yet — add one above.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="cardify">
                <thead>
                  <tr><th>Name</th><th>Pay</th><th>Bonus</th><th>Total in wallet</th><th>Active</th><th>Plan ID</th><th></th></tr>
                </thead>
                <tbody>
                  {offers.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Name"><b>{(p.title as string) || '(unnamed)'}</b></td>
                      <td data-label="Pay">{formatPaise(p.amount)}</td>
                      <td data-label="Bonus">{formatPaise(p.bonus)}</td>
                      <td data-label="Total in wallet"><b style={{ color: 'var(--gold-deep)' }}>{formatPaise(total(p))}</b></td>
                      <td data-label="Active">
                        <button className="btn sm secondary" onClick={() => toggle(p.id, 'active', p.active)}>
                          {p.active ? 'On' : 'Off'}
                        </button>
                      </td>
                      <td data-label="Plan ID">
                        <button className="btn sm secondary" title="Copy plan ID" onClick={() => copyId(p.id)}
                          style={{ fontFamily: 'monospace', fontSize: 11 }}>
                          {copied === p.id ? '✓ Copied' : `${p.id.slice(0, 8)}… ⧉`}
                        </button>
                      </td>
                      <td data-label=""><button className="btn sm danger" onClick={() => remove(p.id)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </MobileSection>
      )}
    </div>
  );
}
