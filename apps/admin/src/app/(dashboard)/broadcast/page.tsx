'use client';

import { useState } from 'react';
import { callFn } from '@/lib/hooks';
import { ImageUpload } from '@/components/ImageUpload';
import { PromoPreview } from '@/components/PromoPreview';
import { LandingControls, DisplayMode } from '@/components/LandingControls';
import { DeepLinkSelect } from '@/components/DeepLinkSelect';

type Segment = 'all_users' | 'paid_users' | 'unpaid_users' | 'astrologers';
const AUDIENCE: { key: Segment; label: string }[] = [
  { key: 'all_users', label: 'All Users' },
  { key: 'paid_users', label: 'Paid Users' },
  { key: 'unpaid_users', label: 'Unpaid Users' },
  { key: 'astrologers', label: 'Astrologers' },
];
const PRESETS = ['#2e2b5f', '#6b4bc0', '#b8862a', '#1f7a5a', '#c0473f', '#12121a'];

export default function BroadcastPage() {
  const [segment, setSegment] = useState<Segment>('all_users');
  const [f, setF] = useState({ title: '', body: '', deeplink: '', image: '' });
  const [imageStyle, setImageStyle] = useState<'banner' | 'portrait'>('banner');
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
  const [result, setResult] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function send() {
    if (!f.title.trim() || !f.body.trim()) return alert('Title and message are required.');
    const label = AUDIENCE.find((a) => a.key === segment)?.label;
    if (!confirm(`Push this notification to ${label}?`)) return;
    setBusy(true); setResult(null);
    try {
      const res = await callFn<{ delivered: number }>('sendBroadcast', {
        title: f.title.trim(), body: f.body.trim(), segment, type: 'announcement',
        deeplink: f.deeplink.trim() || undefined,
        image: f.image.trim() || undefined,
        imageStyle: f.image.trim() ? imageStyle : undefined,
        bgColor: bg, textColor: fg,
        displayMode,
        portraitImage: displayMode !== 'small' ? (portraitImage.trim() || undefined) : undefined,
        ctaText: displayMode !== 'small' ? (ctaText.trim() || undefined) : undefined,
        landingTitle: displayMode !== 'small' ? (lTitle.trim() || undefined) : undefined,
        landingBody: displayMode !== 'small' ? (lBody.trim() || undefined) : undefined,
        landingBgColor: displayMode !== 'small' ? lBg : undefined,
        landingTextColor: displayMode !== 'small' ? lFg : undefined,
      });
      setResult(`✓ Pushed to ${res.delivered} ${label}.`);
      setF({ title: '', body: '', deeplink: '', image: '' });
      setPortraitImage(''); setCtaText(''); setDisplayMode('small');
      setLTitle(''); setLBody(''); setLBg('#2e2b5f'); setLFg('#ffffff');
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Push Notifications</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Design it, preview the exact look, then Commit &amp; Push.</p>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 18, marginTop: 16 }}>
        {/* Composer */}
        <div className="card">
          <p className="af-label" style={{ marginTop: 0 }}>Audience</p>
          <div className="pickrow">
            {AUDIENCE.map((a) => <button key={a.key} type="button" className={`pickchip${segment === a.key ? ' on' : ''}`} onClick={() => setSegment(a.key)}>{a.label}</button>)}
          </div>

          <label className="af" style={{ marginTop: 16 }}><span>Title</span>
            <input className="input" placeholder="✨ Your stars align today" value={f.title} onChange={(e) => set('title', e.target.value)} /></label>
          <label className="af" style={{ marginTop: 12 }}><span>Description</span>
            <textarea className="input" rows={3} placeholder="Consult a top astrologer now…" value={f.body} onChange={(e) => set('body', e.target.value)} /></label>
          <div className="af" style={{ marginTop: 12 }}><span>On tap — go to</span>
            <DeepLinkSelect value={f.deeplink} onChange={(v) => set('deeplink', v)} /></div>

          <p className="af-label">Image (upload from your desktop)</p>
          <ImageUpload folder="notification_images" value={f.image} onChange={(url) => set('image', url)} shape="wide" />
          {f.image && (
            <div className="pickrow" style={{ marginTop: 10 }}>
              <button type="button" className={`pickchip${imageStyle === 'banner' ? ' on' : ''}`} onClick={() => setImageStyle('banner')}>As Banner</button>
              <button type="button" className={`pickchip${imageStyle === 'portrait' ? ' on' : ''}`} onClick={() => setImageStyle('portrait')}>As Portrait</button>
            </div>
          )}

          <p className="af-label">Background &amp; text colour</p>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="color-field"><span className="muted" style={{ fontSize: 12 }}>Background</span><input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></div>
            <div className="color-field"><span className="muted" style={{ fontSize: 12 }}>Text</span><input type="color" value={fg} onChange={(e) => setFg(e.target.value)} /></div>
            <div className="pickrow">{PRESETS.map((c) => <button key={c} type="button" onClick={() => setBg(c)} title={c} style={{ width: 24, height: 24, borderRadius: 7, border: '1px solid var(--line)', background: c, cursor: 'pointer' }} />)}</div>
          </div>

          <LandingControls mode={displayMode} setMode={setDisplayMode} portrait={portraitImage} setPortrait={setPortraitImage}
            cta={ctaText} setCta={setCtaText} title={lTitle} setTitle={setLTitle} body={lBody} setBody={setLBody}
            bg={lBg} setBg={setLBg} fg={lFg} setFg={setLFg} />

          <div style={{ marginTop: 18 }}>
            <button className="btn" disabled={busy} onClick={send}>{busy ? 'Pushing…' : '⚡ Commit & Push'}</button>
            {result && <span style={{ marginLeft: 12, color: 'var(--success)', fontWeight: 600 }}>{result}</span>}
          </div>
        </div>

        {/* Live preview */}
        <PromoPreview kind="push" title={f.title} body={f.body} image={f.image} imageStyle={imageStyle} bg={bg} fg={fg}
          displayMode={displayMode} portraitImage={portraitImage} ctaText={ctaText}
          landingTitle={lTitle} landingBody={lBody} landingBg={lBg} landingFg={lFg} />
      </div>
    </div>
  );
}
