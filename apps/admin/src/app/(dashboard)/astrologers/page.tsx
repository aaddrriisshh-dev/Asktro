'use client';

import { useState } from 'react';
import { useCollection, callFn, Row } from '@/lib/hooks';

const STATUS_COLORS: Record<string, string> = {
  approved: 'green',
  pending: 'amber',
  suspended: 'red',
  rejected: 'red',
  disabled: 'red',
};

const rupees = (paise: unknown) => (typeof paise === 'number' ? paise / 100 : null);

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

  // Quick inline edit of the two economic fields (a full editor can come later).
  async function editRates(a: Row) {
    const curRate = rupees(a.ratePerMinutePaise);
    const rateStr = prompt(`Price per minute for ${a.name} (₹):`, curRate != null ? String(curRate) : '');
    if (rateStr === null) return;
    const curComm = typeof a.commissionPercent === 'number' ? a.commissionPercent : '';
    const commStr = prompt(`Platform commission for ${a.name} (%):`, String(curComm));
    if (commStr === null) return;
    try {
      await callFn('updateAstrologer', {
        astrologerId: a.id,
        ratePerMinutePaise: Math.round((Number(rateStr) || 0) * 100),
        commissionPercent: Number(commStr) || 0,
      });
      alert('Updated. Applies to the astrologer’s next consultation.');
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
              <tr>
                <th>Name</th><th>Experience</th><th>Rating</th>
                <th>Rate (₹/min)</th><th>Commission</th>
                <th>Online</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a: Row) => {
                const rate = rupees(a.ratePerMinutePaise);
                return (
                  <tr key={a.id}>
                    <td>
                      {a.name}{a.verified ? ' ✓' : ''}
                      {a.isAI ? <span className="badge" style={{ marginLeft: 6, fontSize: 11 }}>AI</span> : ''}
                    </td>
                    <td>{a.experience ?? 0}y</td>
                    <td>{(a.rating ?? 0).toFixed(1)}★ ({a.totalReviews ?? 0})</td>
                    <td>{rate != null ? `₹${rate}` : <span className="muted">default</span>}</td>
                    <td>{typeof a.commissionPercent === 'number' ? `${a.commissionPercent}%` : <span className="muted">default</span>}</td>
                    <td>{a.onlineStatus ? '🟢' : '⚪'}</td>
                    <td><span className={`badge ${STATUS_COLORS[a.accountStatus] ?? ''}`}>{a.accountStatus ?? 'pending'}</span></td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn sm secondary" onClick={() => editRates(a)}>Edit rate</button>
                      {a.accountStatus !== 'approved' && (
                        <button className="btn sm" onClick={() => setStatus(a.id, 'approved')}>Approve</button>
                      )}
                      {a.accountStatus === 'approved' && (
                        <button className="btn sm secondary" onClick={() => setStatus(a.id, 'suspended')}>Suspend</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AddAstrologer({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', experience: '', languages: '', expertise: '', about: '',
    ratePerMinute: '', commissionPercent: '', profilePhoto: '',
  });
  const [isAI, setIsAI] = useState(false);
  const [busy, setBusy] = useState(false);

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.name.trim()) return alert('Name is required.');
    if (!form.email.trim()) return alert('Email is required (it becomes the astrologer’s login).');
    setBusy(true);
    try {
      // Route through createAstrologer so the astrologer gets a real login +
      // role claim (a raw doc write would create a profile that can't sign in).
      const res = await callFn<{ tempPassword?: string | null }>('createAstrologer', {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        experience: Number(form.experience) || 0,
        languages: form.languages.split(',').map((s) => s.trim()).filter(Boolean),
        expertise: form.expertise.split(',').map((s) => s.trim()).filter(Boolean),
        about: form.about.trim(),
        ratePerMinutePaise: form.ratePerMinute ? Math.round(Number(form.ratePerMinute) * 100) : undefined,
        commissionPercent: form.commissionPercent ? Number(form.commissionPercent) : undefined,
        profilePhoto: form.profilePhoto.trim() || undefined,
        isAI,
      });
      if (res?.tempPassword) {
        alert(`Astrologer created.\n\nLogin email: ${form.email.trim()}\nTemporary password: ${res.tempPassword}\n\nShare these; they can change the password after first login.`);
      } else {
        alert('Astrologer created.');
      }
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
        <input className="input" placeholder="Email (login)" value={form.email} onChange={(e) => set('email', e.target.value)} />
        <input className="input" placeholder="Phone (+91…)" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        <input className="input" placeholder="Experience (years)" value={form.experience} onChange={(e) => set('experience', e.target.value)} />
        <input className="input" placeholder="Languages (comma separated)" value={form.languages} onChange={(e) => set('languages', e.target.value)} />
        <input className="input" placeholder="Expertise (comma separated)" value={form.expertise} onChange={(e) => set('expertise', e.target.value)} />
        <input className="input" placeholder="Price per minute (₹)" value={form.ratePerMinute} onChange={(e) => set('ratePerMinute', e.target.value)} />
        <input className="input" placeholder="Commission (%)" value={form.commissionPercent} onChange={(e) => set('commissionPercent', e.target.value)} />
        <input className="input" placeholder="Profile photo URL" value={form.profilePhoto} onChange={(e) => set('profilePhoto', e.target.value)} />
      </div>
      <textarea className="input" placeholder="About" style={{ marginTop: 12 }} value={form.about} onChange={(e) => set('about', e.target.value)} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 14 }}>
        <input type="checkbox" checked={isAI} onChange={(e) => setIsAI(e.target.checked)} />
        AI astrologer (adds a subtle “AI” tag in the app)
      </label>
      <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
        Leave price / commission blank to use the platform defaults from Pricing &amp; Settings.
      </p>
      <div style={{ marginTop: 12 }}>
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save astrologer'}</button>
      </div>
    </div>
  );
}
