'use client';

import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection, callFn, Row } from '@/lib/hooks';

const STATUS_COLORS: Record<string, string> = {
  approved: 'green',
  pending: 'amber',
  suspended: 'red',
  rejected: 'red',
  disabled: 'red',
};

export default function AstrologersPage() {
  const { rows, loading } = useCollection('astrologers');
  const [showAdd, setShowAdd] = useState(false);

  async function setStatus(id: string, status: string) {
    try {
      await callFn('setAstrologerStatus', { astrologerId: id, status });
    } catch (e) {
      alert('Failed: ' + (e as Error).message);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Astrologers</h1>
        <button className="btn" onClick={() => setShowAdd((s) => !s)}>
          {showAdd ? 'Close' : 'Add astrologer'}
        </button>
      </div>

      {showAdd && <AddAstrologer onDone={() => setShowAdd(false)} />}

      <div className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <table>
            <thead>
              <tr><th>Name</th><th>Experience</th><th>Rating</th><th>Online</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {rows.map((a: Row) => (
                <tr key={a.id}>
                  <td>{a.name}{a.verified ? ' ✓' : ''}</td>
                  <td>{a.experience ?? 0}y</td>
                  <td>{(a.rating ?? 0).toFixed(1)}★ ({a.totalReviews ?? 0})</td>
                  <td>{a.onlineStatus ? '🟢' : '⚪'}</td>
                  <td><span className={`badge ${STATUS_COLORS[a.accountStatus] ?? ''}`}>{a.accountStatus ?? 'pending'}</span></td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {a.accountStatus !== 'approved' && (
                      <button className="btn sm" onClick={() => setStatus(a.id, 'approved')}>Approve</button>
                    )}
                    {a.accountStatus === 'approved' && (
                      <button className="btn sm secondary" onClick={() => setStatus(a.id, 'suspended')}>Suspend</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AddAstrologer({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', experience: '', languages: '', expertise: '', about: '' });
  const [busy, setBusy] = useState(false);

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.name.trim()) return alert('Name is required.');
    setBusy(true);
    try {
      await addDoc(collection(db, 'astrologers'), {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        experience: Number(form.experience) || 0,
        languages: form.languages.split(',').map((s) => s.trim()).filter(Boolean),
        expertise: form.expertise.split(',').map((s) => s.trim()).filter(Boolean),
        about: form.about.trim(),
        rating: 0,
        totalReviews: 0,
        totalConsultations: 0,
        followers: 0,
        earnings: 0,
        pendingPayout: 0,
        onlineStatus: false,
        available: false,
        verified: true,
        featured: false,
        active: true,
        accountStatus: 'approved',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onDone();
    } catch (e) {
      alert('Failed: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ marginTop: 0 }}>Add astrologer</h3>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <input className="input" placeholder="Full name" value={form.name} onChange={(e) => set('name', e.target.value)} />
        <input className="input" placeholder="Phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        <input className="input" placeholder="Email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        <input className="input" placeholder="Experience (years)" value={form.experience} onChange={(e) => set('experience', e.target.value)} />
        <input className="input" placeholder="Languages (comma separated)" value={form.languages} onChange={(e) => set('languages', e.target.value)} />
        <input className="input" placeholder="Expertise (comma separated)" value={form.expertise} onChange={(e) => set('expertise', e.target.value)} />
      </div>
      <textarea className="input" placeholder="About" style={{ marginTop: 12 }} value={form.about} onChange={(e) => set('about', e.target.value)} />
      <div style={{ marginTop: 12 }}>
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save astrologer'}</button>
      </div>
    </div>
  );
}
