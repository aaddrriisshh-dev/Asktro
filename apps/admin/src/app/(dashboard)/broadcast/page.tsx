'use client';

import { useState } from 'react';
import { callFn, useCollection } from '@/lib/hooks';
import { ImageUpload } from '@/components/ImageUpload';
import { PromoPreview } from '@/components/PromoPreview';
import { LandingControls, DisplayMode } from '@/components/LandingControls';
import { DeepLinkSelect } from '@/components/DeepLinkSelect';
import { ThemePicker } from '@/components/ThemePicker';
import { Collapsible } from '@/components/Collapsible';
import { PromoTheme } from '@/lib/promoThemes';

type Segment = 'all_users' | 'paid_users' | 'unpaid_users' | 'astrologers';
const AUDIENCE: { key: Segment; label: string }[] = [
  { key: 'all_users', label: 'All Users' },
  { key: 'paid_users', label: 'Paid Users' },
  { key: 'unpaid_users', label: 'Unpaid Users' },
  { key: 'astrologers', label: 'Astrologers' },
];
const PRESETS = ['#2e2b5f', '#6b4bc0', '#b8862a', '#1f7a5a', '#c0473f', '#12121a'];

function fmtWhen(ts: unknown): string {
  const secs = (ts as { seconds?: number; _seconds?: number } | null)?.seconds
    ?? (ts as { _seconds?: number } | null)?._seconds;
  if (!secs) return '—';
  return new Date(secs * 1000).toLocaleString('en-IN',
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function BroadcastPage() {
  const { rows: sent, loading: sentLoading } = useCollection('broadcasts');
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
  const [theme, setTheme] = useState('');
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  function applyTheme(t: PromoTheme | null) {
    if (!t) { setTheme(''); return; }
    setTheme(t.id);
    setBg(t.base); setFg(t.tx); setLBg(t.base); setLFg(t.tx);
  }

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
        theme: theme || undefined,
      });
      setResult(`✓ Pushed to ${res.delivered} ${label}.`);
      setF({ title: '', body: '', deeplink: '', image: '' });
      setTheme('');
      setPortraitImage(''); setCtaText(''); setDisplayMode('small');
      setLTitle(''); setLBody(''); setLBg('#2e2b5f'); setLFg('#ffffff');
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Push Notifications</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Design it, preview the exact look, then Commit &amp; Push.</p>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,0.82fr) minmax(0,1.18fr)', gap: 18, marginTop: 16, alignItems: 'start' }}>
        {/* LEFT — live preview, pinned so it never overlaps the form */}
        <PromoPreview kind="push" theme={theme} title={f.title} body={f.body} image={f.image} imageStyle={imageStyle} bg={bg} fg={fg}
          displayMode={displayMode} portraitImage={portraitImage} ctaText={ctaText}
          landingTitle={lTitle} landingBody={lBody} landingBg={lBg} landingFg={lFg} />

        {/* RIGHT — everything you edit */}
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

          <p className="af-label">Theme (pick one — no design needed)</p>
          <ThemePicker value={theme} onSelect={applyTheme} />

          <p className="af-label">Image (optional — overrides the theme background)</p>
          <ImageUpload folder="notification_images" value={f.image} onChange={(url) => set('image', url)} shape="wide" />
          {f.image && (
            <div className="pickrow" style={{ marginTop: 10 }}>
              <button type="button" className={`pickchip${imageStyle === 'banner' ? ' on' : ''}`} onClick={() => setImageStyle('banner')}>As Banner</button>
              <button type="button" className={`pickchip${imageStyle === 'portrait' ? ' on' : ''}`} onClick={() => setImageStyle('portrait')}>As Portrait</button>
            </div>
          )}

          <Collapsible title="Background & text colour" summary="Optional — your theme already sets these">
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="color-field"><span className="muted" style={{ fontSize: 12 }}>Background</span><input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></div>
              <div className="color-field"><span className="muted" style={{ fontSize: 12 }}>Text</span><input type="color" value={fg} onChange={(e) => setFg(e.target.value)} /></div>
              <div className="pickrow">{PRESETS.map((c) => <button key={c} type="button" onClick={() => setBg(c)} title={c} style={{ width: 24, height: 24, borderRadius: 7, border: '1px solid var(--line)', background: c, cursor: 'pointer' }} />)}</div>
            </div>
          </Collapsible>

          <LandingControls mode={displayMode} setMode={setDisplayMode} portrait={portraitImage} setPortrait={setPortraitImage}
            cta={ctaText} setCta={setCtaText} title={lTitle} setTitle={setLTitle} body={lBody} setBody={setLBody}
            bg={lBg} setBg={setLBg} fg={lFg} setFg={setLFg} />

          <div style={{ marginTop: 18 }}>
            <button className="btn" disabled={busy} onClick={send}>{busy ? 'Pushing…' : '⚡ Commit & Push'}</button>
            {result && <span style={{ marginLeft: 12, color: 'var(--success)', fontWeight: 600 }}>{result}</span>}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 className="celeste" style={{ marginTop: 0 }}>Recent broadcasts</h3>
        {sentLoading ? <p className="muted">Loading…</p> : sent.length === 0 ? <p className="muted">No broadcasts sent yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cardify">
              <thead><tr><th>Title</th><th>Audience</th><th>Reached</th><th>Style</th><th>Sent by</th><th>When</th></tr></thead>
              <tbody>
                {[...sent]
                  .sort((a, b) => ((b.createdAt as { seconds?: number })?.seconds ?? 0) - ((a.createdAt as { seconds?: number })?.seconds ?? 0))
                  .map((b) => (
                    <tr key={b.id}>
                      <td data-label="Title"><b>{(b.title as string) || '—'}</b></td>
                      <td data-label="Audience"><span className="badge amber">{AUDIENCE.find((a) => a.key === (b.segment as Segment))?.label ?? 'All Users'}</span></td>
                      <td data-label="Reached">{(b.delivered as number) ?? 0}</td>
                      <td data-label="Style" className="muted" style={{ fontSize: 13 }}>{(b.theme as string) || 'plain'} · {(b.displayMode as string) || 'small'}</td>
                      <td data-label="Sent by" className="muted" style={{ fontSize: 13 }}>{(b.sentByName as string) || '—'}</td>
                      <td data-label="When" className="muted" style={{ fontSize: 13 }}>{fmtWhen(b.createdAt)}</td>
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
