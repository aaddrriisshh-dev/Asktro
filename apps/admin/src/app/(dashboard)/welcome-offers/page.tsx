'use client';

import { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection, Row } from '@/lib/hooks';
import { formatPaise, rupeesToPaise } from '@/lib/format';
import { MobileSection } from '@/components/MobileSection';

/** Welcome Offers = first-recharge promos shown ONLY in the welcome pop-up
 *  (Home Pop-up Studio). They live in `rechargePlans` with planType 'welcome',
 *  so the server's recharge engine credits them exactly like any plan (charge =
 *  Amount, wallet = Amount + Bonus), but the app hides them from the normal
 *  recharge grid AND the "offers & plans" screen. `firstRechargeOnly` makes the
 *  server reject the offer once a user has ever recharged. */
export default function WelcomeOffersPage() {
  const { rows, loading } = useCollection('rechargePlans');
  const [f, setF] = useState({ title: '', amount: '', bonus: '', order: '', firstOnly: true });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const welcome = rows
    .filter((p) => ((p.planType as string) ?? '') === 'welcome')
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || (a.amount ?? 0) - (b.amount ?? 0));

  async function add() {
    const amount = rupeesToPaise(Number(f.amount));
    if (amount <= 0) return alert('Enter a valid recharge amount (what the user pays).');
    const bonus = rupeesToPaise(Number(f.bonus) || 0);
    setSaving(true);
    try {
      await addDoc(collection(db, 'rechargePlans'), {
        title: f.title.trim() || 'Welcome offer',
        amount, // what the user is charged
        walletCredit: amount, // real cash credited = the amount paid
        bonus, // the extra; total in wallet = amount + bonus
        planType: 'welcome',
        firstRechargeOnly: f.firstOnly,
        popular: false,
        recommended: false,
        displayOrder: Number(f.order) || 0,
        active: true,
      });
      setF({ title: '', amount: '', bonus: '', order: '', firstOnly: true });
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setSaving(false); }
  }

  async function toggle(id: string, field: string, value: boolean) {
    await updateDoc(doc(db, 'rechargePlans', id), { [field]: !value });
  }

  async function remove(id: string) {
    if (!confirm('Delete this welcome offer permanently?')) return;
    await deleteDoc(doc(db, 'rechargePlans', id));
  }

  async function copyId(id: string) {
    try { await navigator.clipboard.writeText(id); setCopied(id); setTimeout(() => setCopied(null), 1200); }
    catch { /* clipboard blocked — the id is still visible to select manually */ }
  }

  const total = (p: Row) => (p.walletCredit ?? p.amount ?? 0) + (p.bonus ?? 0);

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Welcome Offers</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        Special first-recharge offers for the <b>welcome pop-up</b> (new / never-recharged users). They are
        <b> hidden</b> from the normal recharge screen and the &ldquo;offers &amp; plans&rdquo; section — they only appear
        when a user taps the welcome banner. After you create one here, wire it to the banner in
        <b> Home Pop-up</b> (&ldquo;Recharge plan the button opens&rdquo;).
      </p>

      <MobileSection title="New welcome offer" defaultOpen={true}>
      <div className="card" style={{ margin: '16px 0 20px' }}>
        <h3 style={{ marginTop: 0 }}>New welcome offer</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Name (for you)</span>
            <input className="input" placeholder="e.g. Triple Dhamaka" style={{ width: 200 }}
              value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Pay ₹ (charged)</span>
            <input className="input" placeholder="e.g. 25" style={{ width: 120 }}
              value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Bonus ₹ (extra)</span>
            <input className="input" placeholder="e.g. 50" style={{ width: 120 }}
              value={f.bonus} onChange={(e) => setF({ ...f, bonus: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Order</span>
            <input className="input" placeholder="0" style={{ width: 80 }}
              value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: 'var(--navy)', paddingBottom: 8 }}>
            <input type="checkbox" checked={f.firstOnly} onChange={(e) => setF({ ...f, firstOnly: e.target.checked })} />
            First recharge only
          </label>
          <button className="btn" onClick={add} disabled={saving} style={{ marginBottom: 2 }}>
            {saving ? 'Adding…' : 'Add offer'}
          </button>
        </div>
        <p className="muted" style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.5 }}>
          <b>Pay</b> = what the user is charged. <b>Total in wallet</b> = Pay + Bonus. Example: Pay ₹25, Bonus ₹50
          → the user pays ₹25 and gets <b>₹75</b> in their wallet. <b>First recharge only</b> makes the server
          block the offer once the user has ever recharged (keep it on for a true welcome offer).
        </p>
      </div>
      </MobileSection>

      {loading ? <p className="muted">Loading…</p> : (
        <MobileSection title="Your welcome offers" defaultOpen={true}>
        <div className="card sess-col" style={{ borderTop: '3px solid var(--gold)' }}>
          <div className="sess-col-head">
            <h3 className="celeste" style={{ margin: 0 }}>🎁 Welcome offers</h3>
            <span className="udet-total">{welcome.length}</span>
          </div>
          <p className="muted" style={{ margin: '4px 0 10px', fontSize: 12 }}>
            Shown only in the welcome pop-up. Wire one to the banner in <b>Home Pop-up</b>.
          </p>
          {welcome.length === 0 ? (
            <p className="muted" style={{ margin: '6px 0' }}>None yet — add one above.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="cardify">
                <thead>
                  <tr><th>Name</th><th>Pay</th><th>Bonus</th><th>Total in wallet</th><th>First recharge only</th><th>Active</th><th>Plan ID (for Home Pop-up)</th><th></th></tr>
                </thead>
                <tbody>
                  {welcome.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Name"><b>{(p.title as string) || '(unnamed)'}</b></td>
                      <td data-label="Pay">{formatPaise(p.amount)}</td>
                      <td data-label="Bonus">{formatPaise(p.bonus)}</td>
                      <td data-label="Total in wallet"><b style={{ color: 'var(--gold-deep)' }}>{formatPaise(total(p))}</b></td>
                      <td data-label="First recharge only">
                        <button className={`btn sm ${p.firstRechargeOnly === true ? '' : 'secondary'}`}
                          onClick={() => toggle(p.id, 'firstRechargeOnly', p.firstRechargeOnly === true)}>
                          {p.firstRechargeOnly === true ? 'Yes' : 'No'}
                        </button>
                      </td>
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
