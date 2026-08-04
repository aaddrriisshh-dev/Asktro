'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra',
  'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
  'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman & Nicobar', 'Chandigarh', 'Dadra & Nagar Haveli and Daman & Diu', 'Delhi',
  'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

type Zone = { name: string; states: string[]; fee: string; freeOver: string };

/** Shipping — the store's delivery charges, all portal-managed. A flat fee +
 *  free-shipping threshold apply everywhere, and optional per-region zones
 *  (matched by the delivery state) override the fee for those areas. The server
 *  re-derives shipping from these values at checkout, so nothing is trusted from
 *  the client. Saved to config/store (Super Admin only). */
export default function ShippingPage() {
  const [loaded, setLoaded] = useState(false);
  const [fee, setFee] = useState('');
  const [freeEnabled, setFreeEnabled] = useState(true);
  const [freeOver, setFreeOver] = useState('');
  const [zones, setZones] = useState<Zone[]>([]);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'store'), (snap) => {
      const d = snap.data() ?? {};
      const r = (paise: unknown) => (typeof paise === 'number' && paise > 0 ? String(paise / 100) : '');
      setFee(typeof d.shippingFeePaise === 'number' ? String(d.shippingFeePaise / 100) : '49');
      setFreeEnabled(d.freeShippingEnabled !== false);
      setFreeOver(typeof d.freeShippingThresholdPaise === 'number' && d.freeShippingThresholdPaise > 0
        ? String(d.freeShippingThresholdPaise / 100) : '499');
      setZones(Array.isArray(d.zones)
        ? (d.zones as Record<string, unknown>[]).map((z) => ({
            name: (z.name as string) ?? '',
            states: Array.isArray(z.states) ? (z.states as string[]) : [],
            fee: r(z.feePaise), freeOver: r(z.freeThresholdPaise),
          }))
        : []);
      setLoaded(true);
    });
    return unsub;
  }, []);

  const setZone = (i: number, patch: Partial<Zone>) =>
    setZones((zs) => zs.map((z, j) => (j === i ? { ...z, ...patch } : z)));
  const toggleState = (i: number, st: string) =>
    setZones((zs) => zs.map((z, j) => j === i
      ? { ...z, states: z.states.includes(st) ? z.states.filter((s) => s !== st) : [...z.states, st] }
      : z));
  const addZone = () => setZones((zs) => [...zs, { name: '', states: [], fee: '', freeOver: '' }]);
  const removeZone = (i: number) => setZones((zs) => zs.filter((_, j) => j !== i));

  // States already claimed by another zone (a state can only belong to one).
  const claimed = (exceptIdx: number) =>
    new Set(zones.flatMap((z, j) => (j === exceptIdx ? [] : z.states)));

  async function save() {
    if (!fee.trim() || Number(fee) < 0) return alert('Enter a valid flat shipping fee (₹).');
    setBusy(true);
    try {
      await setDoc(doc(db, 'config', 'store'), {
        shippingFeePaise: Math.round(Number(fee) * 100),
        freeShippingEnabled: freeEnabled,
        freeShippingThresholdPaise: freeEnabled && freeOver.trim() ? Math.round(Number(freeOver) * 100) : 0,
        zones: zones
          .filter((z) => z.name.trim() && z.states.length)
          .map((z) => ({
            name: z.name.trim(),
            states: z.states,
            feePaise: Math.round(Number(z.fee || 0) * 100),
            freeThresholdPaise: z.freeOver.trim() ? Math.round(Number(z.freeOver) * 100) : 0,
          })),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      alert('Failed: ' + (e as Error).message + '\n(Shipping settings are Super Admin only.)');
    } finally { setBusy(false); }
  }

  if (!loaded) return <div className="card"><p className="muted">Loading shipping settings…</p></div>;

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Shipping</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Delivery charges for Zodia Mall. The flat fee applies everywhere; add zones to charge different rates by region.
        Checkout re-calculates from these values, so they’re always authoritative.
      </p>

      {/* Base rates */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Base rates</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 460 }}>
          <label className="af"><span>Flat shipping fee (₹)</span>
            <input className="input" type="number" min={0} placeholder="49" value={fee} onChange={(e) => setFee(e.target.value)} />
          </label>
          <label className="af"><span>Free shipping over (₹)</span>
            <input className="input" type="number" min={0} placeholder="499" value={freeOver}
              disabled={!freeEnabled} onChange={(e) => setFreeOver(e.target.value)} />
          </label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 14 }}>
          <input type="checkbox" checked={freeEnabled} onChange={(e) => setFreeEnabled(e.target.checked)} />
          Offer free shipping above a cart value
        </label>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          {freeEnabled
            ? `Orders at or above ₹${freeOver || '—'} ship free; below that, ₹${fee || '—'} (unless a zone overrides it).`
            : `Every order is charged shipping (unless a coupon waives it).`}
        </p>
      </div>

      {/* Zones */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>Regional zones ({zones.length})</h3>
          <button className="btn sm" onClick={addZone}>+ Add zone</button>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
          A zone’s fee applies to the states you assign it, overriding the flat fee. States not in any zone use the base rate.
          Each state belongs to at most one zone.
        </p>

        {zones.length === 0 && <p className="muted" style={{ marginTop: 12 }}>No zones — the flat rate applies everywhere.</p>}

        {zones.map((z, i) => {
          const taken = claimed(i);
          return (
            <div key={i} style={{ border: '1px solid var(--gold,#e7d9b8)', borderRadius: 12, padding: 14, marginTop: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                <label className="af"><span>Zone name</span>
                  <input className="input" placeholder="e.g. North East / Metro" value={z.name} onChange={(e) => setZone(i, { name: e.target.value })} />
                </label>
                <label className="af"><span>Fee (₹)</span>
                  <input className="input" type="number" min={0} placeholder="99" value={z.fee} onChange={(e) => setZone(i, { fee: e.target.value })} />
                </label>
                <label className="af"><span>Free over (₹, optional)</span>
                  <input className="input" type="number" min={0} placeholder="base" value={z.freeOver} onChange={(e) => setZone(i, { freeOver: e.target.value })} />
                </label>
                <button className="btn sm secondary" onClick={() => removeZone(i)} style={{ height: 38 }}>Remove</button>
              </div>
              <div style={{ marginTop: 10 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                  States in this zone ({z.states.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {INDIAN_STATES.map((st) => {
                    const on = z.states.includes(st);
                    const disabled = !on && taken.has(st);
                    return (
                      <button key={st} type="button" disabled={disabled} onClick={() => toggleState(i, st)}
                        title={disabled ? 'Already in another zone' : ''}
                        style={{
                          fontSize: 12, padding: '5px 10px', borderRadius: 999, cursor: disabled ? 'not-allowed' : 'pointer',
                          border: `1px solid ${on ? '#c8871a' : '#e7d9b8'}`,
                          background: on ? '#c8871a' : disabled ? '#f4efe3' : '#fff',
                          color: on ? '#fff' : disabled ? '#c3b58f' : '#5a4b2e', fontWeight: on ? 700 : 500,
                        }}>
                        {st}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18 }}>
        <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save shipping settings'}</button>
        {savedAt && <span className="muted" style={{ fontSize: 13 }}>Saved at {savedAt}</span>}
      </div>
    </div>
  );
}
