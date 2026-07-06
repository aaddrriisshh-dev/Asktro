'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { callFn, Row } from '@/lib/hooks';
import { ImageUpload } from '@/components/ImageUpload';

const EXPERTISE = ['Vedic Astrology', 'Numerology', 'Tarot', 'Vastu Shastra', 'KP Astrology',
  'Nadi Astrology', 'Palmistry', 'Face Reading', 'Prashna', 'Muhurtha'];
const LANGUAGES = ['Hindi', 'English', 'Tamil', 'Telugu', 'Bengali', 'Marathi', 'Kannada', 'Punjabi', 'Gujarati', 'Malayalam'];

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`pickchip${on ? ' on' : ''}`}>{label}</button>;
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

/**
 * One form for both creating and editing an astrologer. In `edit` mode every
 * profile field is editable (email stays fixed — it's the login) and changes
 * go through `updateAstrologer`; in `create` mode it calls `createAstrologer`.
 * The Rising Star toggle lives here so it's available in both flows.
 */
export function AstrologerFormModal({
  mode, isSuper, astrologer, onClose, onSaved,
}: {
  mode: 'create' | 'edit';
  isSuper: boolean;
  astrologer?: Row;
  onClose: () => void;
  onSaved?: (patch: Record<string, unknown>) => void;
}) {
  const a = astrologer ?? ({} as Row);
  const [f, setF] = useState({
    name: str(a.name),
    phone: str(a.phone),
    email: str(a.email),
    experience: a.experience != null ? String(a.experience) : '',
    ratePerMinute: typeof a.ratePerMinutePaise === 'number' ? String(a.ratePerMinutePaise / 100) : '',
    commissionPercent: a.commissionPercent != null ? String(a.commissionPercent) : '',
    about: str(a.about),
    profilePhoto: str(a.profilePhoto),
    password: '',
  });
  const [expertise, setExpertise] = useState<string[]>(arr(a.expertise));
  const [languages, setLanguages] = useState<string[]>(arr(a.languages));
  const [customExp, setCustomExp] = useState('');
  const [isAI, setIsAI] = useState(a.isAI === true);
  const [risingStar, setRisingStar] = useState(a.risingStar === true);
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const toggle = (list: string[], setList: (x: string[]) => void, v: string) =>
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function save() {
    if (!f.name.trim()) return alert('Name is required.');
    if (mode === 'create' && !f.email.trim()) return alert('Name and email are required.');
    if (mode === 'create' && f.password.trim() && f.password.trim().length < 6) {
      return alert('Password must be at least 6 characters (or leave it blank to auto-generate one).');
    }
    setBusy(true);
    try {
      const rate = f.ratePerMinute ? Math.round(Number(f.ratePerMinute) * 100) : undefined;
      const comm = f.commissionPercent ? Number(f.commissionPercent) : undefined;
      if (mode === 'create') {
        const chosen = f.password.trim();
        const res = await callFn<{ tempPassword?: string | null }>('createAstrologer', {
          name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined,
          experience: Number(f.experience) || 0,
          ratePerMinutePaise: rate, commissionPercent: comm,
          about: f.about.trim(), profilePhoto: f.profilePhoto.trim() || undefined,
          expertise, languages, isAI, risingStar,
          ...(chosen ? { password: chosen } : {}),
        });
        const where = isSuper ? 'approved and live.' : 'created and is pending a Super Admin’s approval.';
        // Show whatever password will actually work: the one you set, or the
        // auto-generated temp password the function returned.
        const pwd = chosen || res?.tempPassword;
        alert(`Astrologer ${where}` + (pwd ? `\n\nLogin: ${f.email.trim()}\nPassword: ${pwd}` : ''));
      } else {
        const patch: Record<string, unknown> = {
          astrologerId: a.id,
          name: f.name.trim(),
          phone: f.phone.trim() || null,
          about: f.about.trim(),
          experience: Number(f.experience) || 0,
          expertise, languages, isAI, risingStar,
          ...(rate != null ? { ratePerMinutePaise: rate } : {}),
          ...(comm != null ? { commissionPercent: comm } : {}),
          ...(f.profilePhoto.trim() ? { profilePhoto: f.profilePhoto.trim() } : {}),
        };
        await callFn('updateAstrologer', patch);
        onSaved?.(patch);
      }
      onClose();
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return createPortal(
    <div className="tktmodal-root" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="tktmodal c-gold" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="tktmodal-head">
          <div>
            <h3>{mode === 'create' ? '✦ Add New Astrologer' : '✎ Edit Astrologer'}</h3>
            <p>{mode === 'create'
              ? (isSuper ? 'Goes live immediately.' : 'Will wait for Super Admin approval.')
              : 'Update any profile detail. Email (login) can’t be changed here.'}</p>
          </div>
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
            <label className="af"><span>Email {mode === 'create' ? '* (login)' : '(login — fixed)'}</span>
              <input className="input" placeholder="astro@example.com" value={f.email}
                disabled={mode === 'edit'} onChange={(e) => set('email', e.target.value)} />
            </label>
            <label className="af"><span>Experience (years)</span><input className="input" placeholder="10" value={f.experience} onChange={(e) => set('experience', e.target.value)} /></label>
            <label className="af"><span>Price per minute (₹){mode === 'create' ? ' *' : ''}</span><input className="input" placeholder="15" value={f.ratePerMinute} onChange={(e) => set('ratePerMinute', e.target.value)} /></label>
            <label className="af"><span>Commission (%){mode === 'create' ? ' *' : ''}</span><input className="input" placeholder="40" value={f.commissionPercent} onChange={(e) => set('commissionPercent', e.target.value)} /></label>
          </div>

          {mode === 'create' && (
            <label className="af" style={{ marginTop: 12 }}>
              <span>Password (login) — leave blank to auto-generate</span>
              <input className="input" type="text" placeholder="Set a password (min 6 chars), or leave blank"
                value={f.password} onChange={(e) => set('password', e.target.value)} />
            </label>
          )}

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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={isAI} onChange={(e) => setIsAI(e.target.checked)} /> AI astrologer (adds a subtle “AI” tag in the app)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={risingStar} onChange={(e) => setRisingStar(e.target.checked)} /> ★ Rising Star (features them in the app’s Rising Stars rail)
            </label>
          </div>
        </div>
        <div className="tktmodal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : mode === 'create' ? 'Add Astrologer' : 'Save Changes'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
