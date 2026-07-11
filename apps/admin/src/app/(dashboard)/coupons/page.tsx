'use client';

import { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection, Row } from '@/lib/hooks';
import { useAuth } from '@/lib/auth-context';
import { formatPaise, rupeesToPaise } from '@/lib/format';
import { ImageUpload } from '@/components/ImageUpload';
import { PromoPreview } from '@/components/PromoPreview';
import { LandingControls, DisplayMode } from '@/components/LandingControls';
import { ThemePicker } from '@/components/ThemePicker';
import { Collapsible } from '@/components/Collapsible';
import { PromoTheme } from '@/lib/promoThemes';

const AUDIENCES = [
  { key: 'all', label: 'All Users' },
  { key: 'unpaid', label: 'Unpaid Users' },
  { key: 'paid', label: 'Paid Users' },
] as const;
const AUD_LABEL: Record<string, string> = { all: 'All Users', unpaid: 'Unpaid Users', paid: 'Paid Users' };
const PRESETS = ['#2e2b5f', '#6b4bc0', '#b8862a', '#1f7a5a', '#c0473f', '#12121a'];

function genCode() {
  const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = 'ASK';
  for (let i = 0; i < 5; i++) c += s[Math.floor(Math.random() * s.length)];
  return c;
}

export default function CouponsPage() {
  const { rows, loading } = useCollection('coupons');
  const { user, adminName } = useAuth();
  const [f, setF] = useState({ code: '', title: '', description: '', amount: '', bonus: '', minRecharge: '', usageLimit: '', audience: 'all', image: '', expiry: '' });
  const [bg, setBg] = useState('#6b4bc0');
  const [fg, setFg] = useState('#ffffff');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('small');
  const [portraitImage, setPortraitImage] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [lTitle, setLTitle] = useState('');
  const [lBody, setLBody] = useState('');
  const [lBg, setLBg] = useState('#6b4bc0');
  const [lFg, setLFg] = useState('#ffffff');
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState('');
  const [preview, setPreview] = useState<Row | null>(null);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  // Picking a theme drives the preview and stores its id; bg/fg keep solid
  // fallbacks for older app builds. "None" clears back to manual colours.
  function applyTheme(t: PromoTheme | null) {
    if (!t) { setTheme(''); return; }
    setTheme(t.id);
    setBg(t.base); setFg(t.tx); setLBg(t.base); setLFg(t.tx);
  }

  const autoBody = `Get ${f.amount ? `₹${f.amount}` : '₹—'}${f.bonus ? ` + ₹${f.bonus} bonus` : ''} in your wallet`;
  const previewBody = f.description.trim() || autoBody;

  async function push() {
    if (!f.code.trim()) return alert('A coupon code is required (use Generate).');
    if (!f.amount && !f.bonus) return alert('Set an amount and/or a bonus.');
    setBusy(true);
    try {
      await addDoc(collection(db, 'coupons'), {
        code: f.code.trim().toUpperCase(), type: 'flat',
        title: f.title.trim() || null, description: f.description.trim() || null,
        amount: rupeesToPaise(Number(f.amount) || 0), bonus: rupeesToPaise(Number(f.bonus) || 0), percentage: 0,
        minimumRecharge: rupeesToPaise(Number(f.minRecharge) || 0), maxDiscount: 0,
        usageLimit: Number(f.usageLimit) || 0, usedCount: 0, perUserOnce: true,
        audience: f.audience, image: f.image.trim() || null, bgColor: bg, textColor: fg,
        displayMode,
        portraitImage: displayMode !== 'small' ? (portraitImage.trim() || null) : null,
        ctaText: displayMode !== 'small' ? (ctaText.trim() || null) : null,
        landingTitle: displayMode !== 'small' ? (lTitle.trim() || null) : null,
        landingBody: displayMode !== 'small' ? (lBody.trim() || null) : null,
        landingBgColor: displayMode !== 'small' ? lBg : null,
        landingTextColor: displayMode !== 'small' ? lFg : null,
        theme: theme || null,
        expiry: f.expiry ? Timestamp.fromDate(new Date(f.expiry)) : null, active: true,
        createdBy: user?.uid ?? null, createdByName: adminName || null, createdAt: Timestamp.now(),
      });
      setF({ code: '', title: '', description: '', amount: '', bonus: '', minRecharge: '', usageLimit: '', audience: 'all', image: '', expiry: '' });
      setTheme('');
      setPortraitImage(''); setCtaText(''); setDisplayMode('small');
      setLTitle(''); setLBody(''); setLBg('#6b4bc0'); setLFg('#ffffff');
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Coupons Management</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Design a wallet offer, preview it, then Commit &amp; Push to the chosen audience.</p>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,0.82fr) minmax(0,1.18fr)', gap: 18, marginTop: 16, alignItems: 'start' }}>
        {/* LEFT — live preview, pinned so it never overlaps the form */}
        <PromoPreview kind="coupon" theme={theme} title={f.title || 'Your coupon title'} body={previewBody} code={f.code || 'ASK-XXXXX'} image={f.image} imageStyle="banner" bg={bg} fg={fg}
          displayMode={displayMode} portraitImage={portraitImage} ctaText={ctaText}
          landingTitle={lTitle} landingBody={lBody} landingBg={lBg} landingFg={lFg} />

        {/* RIGHT — everything you edit */}
        <div className="card">
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label className="af"><span>Coupon code</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="input" placeholder="ASK-XXXXX" value={f.code} onChange={(e) => set('code', e.target.value)} />
                <button className="btn sm secondary" onClick={() => set('code', genCode())}>Gen</button>
              </div>
            </label>
            <label className="af"><span>Amount to wallet (₹)</span><input className="input" placeholder="100" value={f.amount} onChange={(e) => set('amount', e.target.value)} /></label>
            <label className="af"><span>Bonus (₹)</span><input className="input" placeholder="100" value={f.bonus} onChange={(e) => set('bonus', e.target.value)} /></label>
            <label className="af"><span>Min recharge (₹)</span><input className="input" placeholder="0" value={f.minRecharge} onChange={(e) => set('minRecharge', e.target.value)} /></label>
            <label className="af"><span>Usage limit (0=∞)</span><input className="input" placeholder="0" value={f.usageLimit} onChange={(e) => set('usageLimit', e.target.value)} /></label>
            <label className="af"><span>Expiry date</span><input className="input" type="date" value={f.expiry} onChange={(e) => set('expiry', e.target.value)} /></label>
          </div>

          <label className="af" style={{ marginTop: 12 }}><span>Title (shown on the card)</span>
            <input className="input" placeholder="Diwali Dhamaka ✨" value={f.title} onChange={(e) => set('title', e.target.value)} /></label>
          <label className="af" style={{ marginTop: 12 }}><span>Description</span>
            <textarea className="input" rows={2} placeholder="Recharge now and get extra in your wallet…" value={f.description} onChange={(e) => set('description', e.target.value)} /></label>

          <p className="af-label">Placement / audience</p>
          <div className="pickrow">
            {AUDIENCES.map((a) => <button key={a.key} type="button" className={`pickchip${f.audience === a.key ? ' on' : ''}`} onClick={() => set('audience', a.key)}>{a.label}</button>)}
          </div>

          <p className="af-label">Theme (pick one — no design needed)</p>
          <ThemePicker value={theme} onSelect={applyTheme} />

          <p className="af-label">Image (optional — overrides the theme background)</p>
          <ImageUpload folder="notification_images" value={f.image} onChange={(url) => set('image', url)} shape="wide" />

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
        <h3 className="celeste" style={{ marginTop: 0 }}>Active coupons</h3>
        {loading ? <p className="muted">Loading…</p> : rows.length === 0 ? <p className="muted">No coupons yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cardify">
              <thead><tr><th>Code</th><th>Reward</th><th>Audience</th><th>Used</th><th>Added by</th><th>Active</th><th></th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Code"><b>{c.code}</b></td>
                    <td data-label="Reward">{formatPaise(c.amount)}{c.bonus ? ` + ${formatPaise(c.bonus)} bonus` : ''}</td>
                    <td data-label="Audience"><span className="badge amber">{AUD_LABEL[c.audience] ?? 'All Users'}</span></td>
                    <td data-label="Used">{c.usedCount ?? 0}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                    <td data-label="Added by" className="muted" style={{ fontSize: 13 }}>{(c.createdByName as string) || '—'}</td>
                    <td data-label="Active">
                      <label className="switch" title={c.active ? 'Active — visible in the app' : 'Off — hidden from the app'}>
                        <input type="checkbox" checked={!!c.active} onChange={() => updateDoc(doc(db, 'coupons', c.id), { active: !c.active })} />
                        <span className="track"></span>
                        <span className="switch-lbl">{c.active ? 'On' : 'Off'}</span>
                      </label>
                    </td>
                    <td data-label="" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm secondary" title="Preview this coupon" onClick={() => setPreview(c)} style={{ marginRight: 6 }}>👁 View</button>
                      <button className="btn sm danger" onClick={() => { if (confirm('Delete this coupon?')) deleteDoc(doc(db, 'coupons', c.id)); }}>Delete</button>
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
            <PromoPreview kind="coupon"
              theme={(preview.theme as string) || ''}
              title={(preview.title as string) || (preview.code as string)}
              body={(preview.description as string) || ''}
              code={(preview.code as string) || ''}
              image={(preview.image as string) || ''}
              imageStyle="banner"
              bg={(preview.bgColor as string) || '#6b4bc0'}
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
