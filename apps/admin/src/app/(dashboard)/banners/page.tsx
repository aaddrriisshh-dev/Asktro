'use client';

import { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection } from '@/lib/hooks';

export default function BannersPage() {
  const { rows, loading } = useCollection('banners');
  const [f, setF] = useState({ title: '', subtitle: '', image: '', deeplink: '', placement: 'home', priority: '' });

  function set(k: string, v: string) { setF((s) => ({ ...s, [k]: v })); }

  async function add() {
    if (!f.title.trim()) return alert('Title is required.');
    await addDoc(collection(db, 'banners'), {
      title: f.title.trim(),
      subtitle: f.subtitle.trim(),
      image: f.image.trim(),
      deeplink: f.deeplink.trim() || null,
      placement: f.placement,
      priority: Number(f.priority) || 0,
      active: true,
      createdAt: serverTimestamp(),
    });
    setF({ title: '', subtitle: '', image: '', deeplink: '', placement: 'home', priority: '' });
  }

  return (
    <div>
      <h1>Banners</h1>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>New banner</h3>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <input className="input" placeholder="Title" value={f.title} onChange={(e) => set('title', e.target.value)} />
          <input className="input" placeholder="Subtitle" value={f.subtitle} onChange={(e) => set('subtitle', e.target.value)} />
          <input className="input" placeholder="Image URL" value={f.image} onChange={(e) => set('image', e.target.value)} />
          <input className="input" placeholder="Deep link (optional)" value={f.deeplink} onChange={(e) => set('deeplink', e.target.value)} />
          <select className="input" value={f.placement} onChange={(e) => set('placement', e.target.value)}>
            <option value="home">Home</option>
            <option value="recharge">Recharge</option>
            <option value="referral">Referral</option>
          </select>
          <input className="input" placeholder="Priority" value={f.priority} onChange={(e) => set('priority', e.target.value)} />
        </div>
        <div style={{ marginTop: 12 }}><button className="btn" onClick={add}>Add banner</button></div>
      </div>
      <div className="card">
        {loading ? <p className="muted">Loading…</p> : (
          <table>
            <thead><tr><th>Title</th><th>Placement</th><th>Priority</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>{b.title}</td>
                  <td>{b.placement}</td>
                  <td>{b.priority ?? 0}</td>
                  <td><button className="btn sm secondary" onClick={() => updateDoc(doc(db, 'banners', b.id), { active: !b.active })}>{b.active ? 'On' : 'Off'}</button></td>
                  <td><button className="btn sm danger" onClick={() => deleteDoc(doc(db, 'banners', b.id))}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
