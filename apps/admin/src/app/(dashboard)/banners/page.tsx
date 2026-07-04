'use client';

import { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection } from '@/lib/hooks';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/format';

const PLACEMENTS = ['home', 'consults', 'wallet', 'alerts', 'profile'] as const;
const PLACE_LABEL: Record<string, string> = { home: 'Home', consults: 'Consults', wallet: 'Wallet', alerts: 'Alerts', profile: 'Profile' };

export default function BannersPage() {
  const { rows, loading } = useCollection('banners');
  const { user, adminName } = useAuth();
  const [f, setF] = useState({ title: '', description: '', image: '', deeplink: '', placement: 'home' });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function push() {
    if (!f.title.trim()) return alert('Title is required.');
    setBusy(true);
    try {
      await addDoc(collection(db, 'banners'), {
        title: f.title.trim(), description: f.description.trim(), image: f.image.trim(),
        deeplink: f.deeplink.trim() || null, placement: f.placement, active: true,
        createdBy: user?.uid ?? null, createdByName: adminName || null,
        createdAt: serverTimestamp(),
      });
      setF({ title: '', description: '', image: '', deeplink: '', placement: 'home' });
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Banners</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Merchandise the app. Commit &amp; Push drops a banner into the chosen area.</p>

      <div className="card" style={{ marginTop: 16, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>New banner</h3>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="af"><span>Title</span><input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} /></label>
          <label className="af"><span>Deep link (optional)</span><input className="input" placeholder="asktro://…" value={f.deeplink} onChange={(e) => set('deeplink', e.target.value)} /></label>
          <label className="af"><span>Image URL</span><input className="input" placeholder="https://…" value={f.image} onChange={(e) => set('image', e.target.value)} /></label>
          <label className="af"><span>Placement</span>
            <select className="input" value={f.placement} onChange={(e) => set('placement', e.target.value)}>
              {PLACEMENTS.map((p) => <option key={p} value={p}>{PLACE_LABEL[p]}</option>)}
            </select>
          </label>
        </div>
        <label className="af" style={{ marginTop: 12 }}><span>Description</span>
          <textarea className="input" rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} /></label>
        <div style={{ marginTop: 14 }}><button className="btn" disabled={busy} onClick={push}>{busy ? 'Pushing…' : '⚡ Commit & Push'}</button></div>
      </div>

      <div className="card">
        {loading ? <p className="muted">Loading…</p> : rows.length === 0 ? <p className="muted">No banners yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Title</th><th>Placement</th><th>Added by</th><th>Created</th><th>Live</th><th></th></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td><b>{b.title}</b></td>
                    <td><span className="badge purple">{PLACE_LABEL[b.placement] ?? b.placement}</span></td>
                    <td className="muted" style={{ fontSize: 13 }}>{(b.createdByName as string) || '—'}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{b.createdAt?.toMillis ? formatDate(b.createdAt.toMillis()) : '—'}</td>
                    <td><button className={`btn sm ${b.active ? 'secondary' : ''}`} onClick={() => updateDoc(doc(db, 'banners', b.id), { active: !b.active })}>{b.active ? 'On' : 'Off'}</button></td>
                    <td><button className="btn sm danger" onClick={() => { if (confirm('Delete this banner?')) deleteDoc(doc(db, 'banners', b.id)); }}>Delete</button></td>
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
