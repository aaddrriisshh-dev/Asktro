'use client';

import { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection, Row } from '@/lib/hooks';
import { useAuth } from '@/lib/auth-context';
import { formatDate, formatPaise } from '@/lib/format';
import { ImageUpload } from '@/components/ImageUpload';
import { PromoPreview } from '@/components/PromoPreview';
import { LandingControls, DisplayMode } from '@/components/LandingControls';
import { DeepLinkSelect } from '@/components/DeepLinkSelect';
import { ThemePicker } from '@/components/ThemePicker';
import { Collapsible } from '@/components/Collapsible';
import { PromoTheme } from '@/lib/promoThemes';

const PLACEMENTS = ['home', 'consults', 'wallet', 'alerts', 'profile'] as const;
const PLACE_LABEL: Record<string, string> = { home: 'Home', consults: 'Consults', wallet: 'Wallet', alerts: 'Alerts', profile: 'Profile' };
const PRESETS = ['#2e2b5f', '#6b4bc0', '#b8862a', '#1f7a5a', '#c0473f', '#12121a'];

type BannerType = 'marketing' | 'recharge';

export default function BannersPage() {
  const { rows, loading } = useCollection('banners');
  const { rows: plans } = useCollection('rechargePlans');
  const { user, adminName } = useAuth();
  const [bannerType, setBannerType] = useState<BannerType>('marketing');
  const [planId, setPlanId] = useState('');
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
  const [theme, setTheme] = useState('');
  const [preview, setPreview] = useState<Row | null>(null);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  function applyTheme(t: PromoTheme | null) {
    if (!t) { setTheme(''); return; }
    setTheme(t.id);
    setBg(t.base); setFg(t.tx); setLBg(t.base); setLFg(t.tx);
  }

  const activePlans = plans.filter((p) => p.active !== false);
  const planLabel = (p: Row) => {
    const bonus = (p.bonus as number) ?? 0;
    return `${formatPaise(p.amount)}${bonus > 0 ? ` → +${formatPaise(p.bonus)} bonus` : ''}`;
  };
  const chosenPlan = plans.find((p) => p.id === planId);

  async function push() {
    if (!f.title.trim()) return alert('Title is required.');
    if (bannerType === 'recharge' && !planId) return alert('Pick the recharge plan this banner promotes.');
    // A recharge banner links straight to its plan's checkout; marketing uses the destination dropdown.
    const deeplink = bannerType === 'recharge' ? `/recharge?plan=${planId}` : (f.deeplink.trim() || null);
    setBusy(true);
    try {
      await addDoc(collection(db, 'banners'), {
        bannerType, planId: bannerType === 'recharge' ? planId : null,
        title: f.title.trim(), description: f.description.trim(), image: f.image.trim(),
        deeplink, placement: f.placement, bgColor: bg, textColor: fg, active: true,
        displayMode,
        portraitImage: displayMode !== 'small' ? (portraitImage.trim() || null) : null,
        ctaText: displayMode !== 'small' ? (ctaText.trim() || null) : null,
        landingTitle: displayMode !== 'small' ? (lTitle.trim() || null) : null,
        landingBody: displayMode !== 'small' ? (lBody.trim() || null) : null,
        landingBgColor: displayMode !== 'small' ? lBg : null,
        landingTextColor: displayMode !== 'small' ? lFg : null,
        theme: theme || null,
        createdBy: user?.uid ?? null, createdByName: adminName || null, createdAt: serverTimestamp(),
      });
      setF({ title: '', description: '', image: '', deeplink: '', placement: 'home' });
      setTheme('');
      setBannerType('marketing'); setPlanId('');
      setPortraitImage(''); setCtaText(''); setDisplayMode('small');
      setLTitle(''); setLBody(''); setLBg('#2e2b5f'); setLFg('#ffffff');
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Banners Management</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Design the banner, preview it, then Commit &amp; Push to the chosen area of the app.</p>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,0.82fr) minmax(0,1.18fr)', gap: 18, marginTop: 16, alignItems: 'start' }}>
        {/* LEFT — live preview, pinned so it never overlaps the form */}
        <PromoPreview kind="banner" theme={theme} title={f.title} body={f.description} image={f.image} imageStyle="banner" bg={bg} fg={fg}
          displayMode={displayMode} portraitImage={portraitImage} ctaText={ctaText}
          landingTitle={lTitle} landingBody={lBody} landingBg={lBg} landingFg={lFg} />

        {/* RIGHT — everything you edit */}
        <div className="card">
          <p className="af-label" style={{ marginTop: 0 }}>Banner type</p>
          <div className="pickrow">
            <button type="button" className={`pickchip${bannerType === 'marketing' ? ' on' : ''}`} onClick={() => setBannerType('marketing')}>📣 Marketing</button>
            <button type="button" className={`pickchip${bannerType === 'recharge' ? ' on' : ''}`} onClick={() => setBannerType('recharge')}>💰 Recharge</button>
          </div>
          <p className="muted" style={{ margin: '6px 0 14px', fontSize: 12 }}>
            {bannerType === 'recharge'
              ? 'Links straight to a specific recharge plan’s checkout — the offer can never drift from the ad.'
              : 'A general promo — you choose where the tap goes.'}
          </p>

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

          {bannerType === 'recharge' ? (
            <div className="af" style={{ marginTop: 12 }}><span>Recharge plan (opens its checkout)</span>
              <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                <option value="">Select a plan…</option>
                {activePlans.map((p) => <option key={p.id} value={p.id}>{planLabel(p)}</option>)}
              </select>
              {chosenPlan
                ? <span className="muted" style={{ fontSize: 12, marginTop: 6 }}>Tapping this banner opens checkout pre-set to <b>{planLabel(chosenPlan)}</b>. Keep your title/description consistent with this offer.</span>
                : activePlans.length === 0 ? <span className="muted" style={{ fontSize: 12, marginTop: 6 }}>No active plans — create one in Recharge Plans first.</span> : null}
            </div>
          ) : (
            <div className="af" style={{ marginTop: 12 }}><span>On tap — go to</span>
              <DeepLinkSelect value={f.deeplink} onChange={(v) => set('deeplink', v)} /></div>
          )}

          <p className="af-label">Theme (pick one — no design needed)</p>
          <ThemePicker value={theme} onSelect={applyTheme} />

          <p className="af-label">Image (optional — overrides the theme background)</p>
          <ImageUpload folder="banner_images" value={f.image} onChange={(url) => set('image', url)} shape="wide" />

          <Collapsible title="Background & text colour" summary="Optional — your theme already sets these">
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="color-field"><span className="muted" style={{ fontSize: 12 }}>Background</span><input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></div>
              <div className="color-field"><span className="muted" style={{ fontSize: 12 }}>Text</span><input type="color" value={fg} onChange={(e) => setFg(e.target.value)} /></div>
              <div className="pickrow">{PRESETS.map((c) => <button key={c} type="button" onClick={() => setBg(c)} style={{ width: 24, height: 24, borderRadius: 7, border: '1px solid var(--line)', background: c, cursor: 'pointer' }} />)}</div>
            </div>
          </Collapsible>

          <LandingControls mode={displayMode} setMode={setDisplayMode} portrait={portraitImage} setPortrait={setPortraitImage}
            cta={ctaText} setCta={setCtaText} title={lTitle} setTitle={setLTitle} body={lBody} setBody={setLBody}
            bg={lBg} setBg={setLBg} fg={lFg} setFg={setLFg} />

          <div style={{ marginTop: 16 }}><button className="btn" disabled={busy} onClick={push}>{busy ? 'Pushing…' : '⚡ Commit & Push'}</button></div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 className="celeste" style={{ marginTop: 0 }}>Live banners</h3>
        {loading ? <p className="muted">Loading…</p> : rows.length === 0 ? <p className="muted">No banners yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cardify">
              <thead><tr><th>Title</th><th>Placement</th><th>Added by</th><th>Created</th><th>Live</th><th></th></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Title"><b>{b.title}</b></td>
                    <td data-label="Placement"><span className="badge purple">{PLACE_LABEL[b.placement] ?? b.placement}</span></td>
                    <td data-label="Added by" className="muted" style={{ fontSize: 13 }}>{(b.createdByName as string) || '—'}</td>
                    <td data-label="Created" className="muted" style={{ fontSize: 13 }}>{b.createdAt?.toMillis ? formatDate(b.createdAt.toMillis()) : '—'}</td>
                    <td data-label="Live"><button className={`btn sm ${b.active ? 'secondary' : ''}`} onClick={() => updateDoc(doc(db, 'banners', b.id), { active: !b.active })}>{b.active ? 'On' : 'Off'}</button></td>
                    <td data-label="" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm secondary" title="Preview this banner" onClick={() => setPreview(b)} style={{ marginRight: 6 }}>👁 View</button>
                      <button className="btn sm danger" onClick={() => { if (confirm('Delete this banner?')) deleteDoc(doc(db, 'banners', b.id)); }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {preview && (
        <div className="pv-modal" onClick={() => setPreview(null)}>
          <button type="button" className="pv-modal__close" onClick={() => setPreview(null)}>×</button>
          <div className="pv-modal__inner" style={{ width: 'min(420px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
            <PromoPreview kind="banner"
              theme={(preview.theme as string) || ''}
              title={(preview.title as string) || ''}
              body={(preview.description as string) || ''}
              image={(preview.image as string) || ''}
              imageStyle="banner"
              bg={(preview.bgColor as string) || '#2e2b5f'}
              fg={(preview.textColor as string) || '#ffffff'}
              displayMode={((preview.displayMode as string) || 'small') as 'small' | 'half' | 'full'}
              portraitImage={(preview.portraitImage as string) || undefined}
              ctaText={(preview.ctaText as string) || undefined}
              landingTitle={(preview.landingTitle as string) || undefined}
              landingBody={(preview.landingBody as string) || undefined} />
          </div>
        </div>
      )}
    </div>
  );
}
