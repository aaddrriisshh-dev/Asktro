'use client';

import { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection } from '@/lib/hooks';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/format';
import { ImageUpload } from '@/components/ImageUpload';
import { PromoPreview } from '@/components/PromoPreview';
import { LandingControls, DisplayMode } from '@/components/LandingControls';

const PLACEMENTS = ['home', 'consults', 'wallet', 'alerts', 'profile'] as const;
const PLACE_LABEL: Record<string, string> = { home: 'Home', consults: 'Consults', wallet: 'Wallet', alerts: 'Alerts', profile: 'Profile' };
const PRESETS = ['#2e2b5f', '#6b4bc0', '#b8862a', '#1f7a5a', '#c0473f', '#12121a'];

export default function BannersPage() {
  const { rows, loading } = useCollection('banners');
  const { user, adminName } = useAuth();
  const [f, setF] = useState({ title: '', description: '', image: '', deeplink: '', placement: 'home' });
  const [bg, setBg] = useState('#2e2b5f');
  const [fg, setFg] = useState('#ffffff');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('small');
  const [portraitImage, setPortraitImage] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [lTitle, setLTitle] = useState('');
  const [lBody, setLBody] = useState('');
  const [lBg, setLBg] = useState('#2e2b5f');
  const [lFg, setLFg] = useState('#ffffff');
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function push() {
    if (!f.title.trim()) return alert('Title is required.');
    setBusy(true);
    try {
      await addDoc(collection(db, 'banners'), {
        title: f.title.trim(), description: f.description.trim(), image: f.image.trim(),
        deeplink: f.deeplink.trim() || null, placement: f.placement, bgColor: bg, textColor: fg, active: true,
        displayMode,
        portraitImage: displayMode !== 'small' ? (portraitImage.trim() || null) : null,
        ctaText: displayMode !== 'small' ? (ctaText.trim() || null) : null,
        landingTitle: displayMode !== 'small' ? (lTitle.trim() || null) : null,
        landingBody: displayMode !== 'small' ? (lBody.trim() || null) : null,
        landingBgColor: displayMode !== 'small' ? lBg : null,
        landingTextColor: displayMode !== 'small' ? lFg : null,
        createdBy: user?.uid ?? null, createdByName: adminName || null, createdAt: serverTimestamp(),
      });
      setF({ title: '', description: '', image: '', deeplink: '', placement: 'home' });
      setPortraitImage(''); setCtaText(''); setDisplayMode('small');
      setLTitle(''); setLBody(''); setLBg('#2e2b5f'); setLFg('#ffffff');
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Banners Management</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Design the banner, preview it, then Commit &amp; Push to the chosen area of the app.</p>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 18, marginTop: 16 }}>
        <div className="card">
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="af"><span>Title</span><input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} /></label>
            <label className="af"><span>Placement</span>
              <select className="input" value={f.placement} onChange={(e) => set('placement', e.target.value)}>
                {PLACEMENTS.map((p) => <option key={p} value={p}>{PLACE_LABEL[p]}</option>)}
              </select>
            </label>
          </div>
          <label className="af" style={{ marginTop: 12 }}><span>Description</span>
            <textarea className="input" rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} /></label>
          <label className="af" style={{ marginTop: 12 }}><span>Deep link (optional)</span>
            <input className="input" placeholder="asktro://…" value={f.deeplink} onChange={(e) => set('deeplink', e.target.value)} /></label>

          <p className="af-label">Image (upload from your desktop)</p>
          <ImageUpload folder="banner_images" value={f.image} onChange={(url) => set('image', url)} shape="wide" />

          <p className="af-label">Background &amp; text colour</p>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="color-field"><span className="muted" style={{ fontSize: 12 }}>Background</span><input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></div>
            <div className="color-field"><span className="muted" style={{ fontSize: 12 }}>Text</span><input type="color" value={fg} onChange={(e) => setFg(e.target.value)} /></div>
            <div className="pickrow">{PRESETS.map((c) => <button key={c} type="button" onClick={() => setBg(c)} style={{ width: 24, height: 24, borderRadius: 7, border: '1px solid var(--line)', background: c, cursor: 'pointer' }} />)}</div>
          </div>

          <LandingControls mode={displayMode} setMode={setDisplayMode} portrait={portraitImage} setPortrait={setPortraitImage}
            cta={ctaText} setCta={setCtaText} title={lTitle} setTitle={setLTitle} body={lBody} setBody={setLBody}
            bg={lBg} setBg={setLBg} fg={lFg} setFg={setLFg} />

          <div style={{ marginTop: 16 }}><button className="btn" disabled={busy} onClick={push}>{busy ? 'Pushing…' : '⚡ Commit & Push'}</button></div>
        </div>

        <PromoPreview kind="banner" title={f.title} body={f.description} image={f.image} imageStyle="banner" bg={bg} fg={fg}
          displayMode={displayMode} portraitImage={portraitImage} ctaText={ctaText}
          landingTitle={lTitle} landingBody={lBody} landingBg={lBg} landingFg={lFg} />
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 className="celeste" style={{ marginTop: 0 }}>Live banners</h3>
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
