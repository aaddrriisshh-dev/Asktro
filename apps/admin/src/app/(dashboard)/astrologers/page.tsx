'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useCollection, callFn, Row } from '@/lib/hooks';
import { useAuth } from '@/lib/auth-context';
import { ImageUpload } from '@/components/ImageUpload';

const PAGE_OPTIONS = [10, 100, 500, 1000];

const STATUS_COLORS: Record<string, string> = {
  approved: 'green', pending: 'amber', suspended: 'red', rejected: 'red', disabled: 'red',
};
const rupees = (paise: unknown) => (typeof paise === 'number' ? paise / 100 : null);

type BoxAction = 'view' | 'edit' | 'approve';

function AstroBox({
  title, icon, accent, list, isSuper, busy, actions, showLiveDot, onStatus, onEditRate,
}: {
  title: string; icon: string; accent: string; list: Row[];
  isSuper: boolean; busy: string | null; actions: BoxAction[]; showLiveDot?: boolean;
  onStatus: (id: string, status: string, name?: string) => void; onEditRate: (a: Row) => void;
}) {
  const [limit, setLimit] = useState(10);
  const shown = list.slice(0, limit);
  return (
    <div className="card custcard" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="sess-col-head">
        <h3 className="celeste" style={{ margin: 0, fontSize: 16 }}>{icon} {title}</h3>
        <span className="udet-total">{list.length}</span>
      </div>
      <div className="custlist">
        {shown.length === 0 ? <p className="drawer-muted" style={{ margin: '10px 0' }}>Nothing here yet.</p> : shown.map((a) => {
          const rate = rupees(a.ratePerMinutePaise);
          const st = (a.accountStatus ?? 'pending') as string;
          return (
            <div key={a.id} className="custrow">
              <div style={{ minWidth: 0 }}>
                <span className="nm">
                  {showLiveDot && a.onlineStatus ? <span className="live-dot" style={{ marginRight: 6 }} /> : null}
                  {a.name || 'Unnamed'}
                  {a.verified ? ' ✓' : ''}
                  {a.isAI ? <span className="badge purple" style={{ marginLeft: 6, fontSize: 10 }}>AI</span> : null}
                </span>
                <span className="ph">
                  {rate != null ? `₹${rate}/min` : 'default rate'} · <span className={`badge ${STATUS_COLORS[st] ?? ''}`} style={{ fontSize: 10 }}>{st}</span>
                </span>
              </div>
              <div className="custrow-right" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {actions.includes('view') && <Link href={`/astrologers/${a.id}`} className="btn sm secondary">View</Link>}
                {actions.includes('edit') && <button className="btn sm secondary" disabled={busy === a.id} onClick={() => onEditRate(a)}>₹</button>}
                {actions.includes('approve') && isSuper && (
                  <>
                    <button className="btn sm" disabled={busy === a.id} onClick={() => onStatus(a.id, 'approved')}>✓</button>
                    <button className="btn sm danger" disabled={busy === a.id} onClick={() => { if (confirm(`Reject ${a.name}?`)) onStatus(a.id, 'rejected'); }}>✕</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="custfoot">
        <span className="muted">Showing {Math.min(limit, list.length)} of {list.length}</span>
        <label className="muted">Rows
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

const EXPERTISE = ['Vedic Astrology', 'Numerology', 'Tarot', 'Vastu Shastra', 'KP Astrology',
  'Nadi Astrology', 'Palmistry', 'Face Reading', 'Prashna', 'Muhurtha'];
const LANGUAGES = ['Hindi', 'English', 'Tamil', 'Telugu', 'Bengali', 'Marathi', 'Kannada', 'Punjabi', 'Gujarati', 'Malayalam'];

export default function AstrologersPage() {
  const { rows, loading } = useCollection('astrologers');
  const { adminRole } = useAuth();
  const isSuper = adminRole === 'super';
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setBusy(id);
    try { await callFn('setAstrologerStatus', { astrologerId: id, status }); }
    catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(null); }
  }
  async function editRates(a: Row) {
    const rateStr = prompt(`Price per minute for ${a.name} (₹):`, String(rupees(a.ratePerMinutePaise) ?? ''));
    if (rateStr === null) return;
    const commStr = prompt(`Platform commission for ${a.name} (%):`, String(typeof a.commissionPercent === 'number' ? a.commissionPercent : ''));
    if (commStr === null) return;
    setBusy(a.id);
    try {
      await callFn('updateAstrologer', {
        astrologerId: a.id,
        ratePerMinutePaise: Math.round((Number(rateStr) || 0) * 100),
        commissionPercent: Number(commStr) || 0,
      });
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(null); }
  }

  const live = rows.filter((a: Row) => a.onlineStatus === true);
  const pending = rows.filter((a: Row) => (a.accountStatus ?? 'pending') === 'pending');

  return (
    <div>
      <div className="uat-head">
        <div>
          <h1 style={{ marginBottom: 2 }}>Astrologer Management</h1>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Live, all, and pending — onboard, approve and manage real &amp; AI astrologers.</p>
        </div>
        <button className="btn" onClick={() => setShowAdd(true)}>+ Add New Astrologer</button>
      </div>

      {loading ? <p className="muted" style={{ marginTop: 16 }}>Loading…</p> : (
        <div className="cust3">
          <AstroBox title="Live Astrologers" icon="🟢" accent="#3cb371" list={live} showLiveDot
            isSuper={isSuper} busy={busy} actions={['view', 'edit']} onStatus={setStatus} onEditRate={editRates} />
          <AstroBox title="All Astrologers" icon="📋" accent="var(--primary)" list={rows}
            isSuper={isSuper} busy={busy} actions={['view', 'edit']} onStatus={setStatus} onEditRate={editRates} />
          <AstroBox title="Pending Approvals" icon="🕐" accent="var(--gold)" list={pending}
            isSuper={isSuper} busy={busy} actions={['view', 'approve']} onStatus={setStatus} onEditRate={editRates} />
        </div>
      )}

      {showAdd && createPortal(<AddAstrologerModal isSuper={isSuper} onClose={() => setShowAdd(false)} />, document.body)}
    </div>
  );
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`pickchip${on ? ' on' : ''}`}>{label}</button>
  );
}

function AddAstrologerModal({ isSuper, onClose }: { isSuper: boolean; onClose: () => void }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', experience: '', ratePerMinute: '', commissionPercent: '', about: '', profilePhoto: '' });
  const [expertise, setExpertise] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [customExp, setCustomExp] = useState('');
  const [isAI, setIsAI] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const toggle = (arr: string[], setArr: (x: string[]) => void, v: string) =>
    setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function save() {
    if (!f.name.trim() || !f.email.trim()) return alert('Name and email are required.');
    setBusy(true);
    try {
      const res = await callFn<{ tempPassword?: string | null }>('createAstrologer', {
        name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined,
        experience: Number(f.experience) || 0,
        ratePerMinutePaise: f.ratePerMinute ? Math.round(Number(f.ratePerMinute) * 100) : undefined,
        commissionPercent: f.commissionPercent ? Number(f.commissionPercent) : undefined,
        about: f.about.trim(), profilePhoto: f.profilePhoto.trim() || undefined,
        expertise, languages, isAI,
      });
      const where = isSuper ? 'approved and live.' : 'created and is pending a Super Admin’s approval.';
      alert(`Astrologer ${where}` + (res?.tempPassword ? `\n\nLogin: ${f.email.trim()}\nTemp password: ${res.tempPassword}` : ''));
      onClose();
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="tktmodal-root" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="tktmodal c-gold" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="tktmodal-head">
          <div><h3>✦ Add New Astrologer</h3><p>{isSuper ? 'Goes live immediately.' : 'Will wait for Super Admin approval.'}</p></div>
          <button className="tktmodal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="tktmodal-body">
          <div className="af" style={{ marginBottom: 14 }}>
            <span>Photo</span>
            <ImageUpload folder="astrologer_photos" value={f.profilePhoto} onChange={(url) => set('profilePhoto', url)} />
          </div>
          <div className="astro-form">
            <label className="af"><span>Name *</span><input className="input" placeholder="Pt. Rajesh Sharma" value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
            <label className="af"><span>Phone</span><input className="input" placeholder="+91 98765 43210" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></label>
            <label className="af"><span>Email * (login)</span><input className="input" placeholder="astro@example.com" value={f.email} onChange={(e) => set('email', e.target.value)} /></label>
            <label className="af"><span>Experience (years)</span><input className="input" placeholder="10" value={f.experience} onChange={(e) => set('experience', e.target.value)} /></label>
            <label className="af"><span>Price per minute (₹) *</span><input className="input" placeholder="15" value={f.ratePerMinute} onChange={(e) => set('ratePerMinute', e.target.value)} /></label>
            <label className="af"><span>Commission (%) *</span><input className="input" placeholder="40" value={f.commissionPercent} onChange={(e) => set('commissionPercent', e.target.value)} /></label>
          </div>

          <label className="af" style={{ marginTop: 12 }}><span>Bio</span>
            <textarea className="input" rows={3} placeholder="Experienced Vedic astrologer with deep knowledge of…" value={f.about} onChange={(e) => set('about', e.target.value)} />
          </label>

          <p className="af-label">Expertise</p>
          <div className="pickrow">
            {EXPERTISE.map((x) => <Chip key={x} label={x} on={expertise.includes(x)} onClick={() => toggle(expertise, setExpertise, x)} />)}
            {expertise.filter((x) => !EXPERTISE.includes(x)).map((x) => <Chip key={x} label={x} on onClick={() => toggle(expertise, setExpertise, x)} />)}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input className="input" placeholder="Add custom expertise…" value={customExp} onChange={(e) => setCustomExp(e.target.value)} />
            <button className="btn sm secondary" onClick={() => { const v = customExp.trim(); if (v) { toggle(expertise, setExpertise, v); setCustomExp(''); } }}>Add</button>
          </div>

          <p className="af-label">Languages</p>
          <div className="pickrow">
            {LANGUAGES.map((x) => <Chip key={x} label={x} on={languages.includes(x)} onClick={() => toggle(languages, setLanguages, x)} />)}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 14 }}>
            <input type="checkbox" checked={isAI} onChange={(e) => setIsAI(e.target.checked)} /> AI astrologer (adds a subtle “AI” tag in the app)
          </label>
        </div>
        <div className="tktmodal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Add Astrologer'}</button>
        </div>
      </div>
    </div>
  );
}
