'use client';

import { ImageUpload } from '@/components/ImageUpload';

export type DisplayMode = 'small' | 'half' | 'full';

const MODES: { key: DisplayMode; label: string; hint: string }[] = [
  { key: 'small', label: 'Small only', hint: 'Just the notification / strip' },
  { key: 'half', label: 'Half-screen', hint: 'Opens a bottom sheet on tap' },
  { key: 'full', label: 'Full-screen', hint: '9:16 portrait fills the phone' },
];

const PRESETS = ['#141c38', '#6b4bc0', '#b8862a', '#1f7a5a', '#c0473f', '#12121a'];

export interface LandingState {
  mode: DisplayMode;
  portrait: string;
  cta: string;
  title: string;
  body: string;
  bg: string;
  fg: string;
}

/** Composer controls for the "what happens when the user taps" landing view.
 *  The landing view has its OWN title, description, colours, portrait image and
 *  CTA — fully independent of the small strip. Shared by Push/Banner/Coupon. */
export function LandingControls({
  mode, setMode, portrait, setPortrait, cta, setCta,
  title, setTitle, body, setBody, bg, setBg, fg, setFg,
}: {
  mode: DisplayMode; setMode: (m: DisplayMode) => void;
  portrait: string; setPortrait: (v: string) => void;
  cta: string; setCta: (v: string) => void;
  title: string; setTitle: (v: string) => void;
  body: string; setBody: (v: string) => void;
  bg: string; setBg: (v: string) => void;
  fg: string; setFg: (v: string) => void;
}) {
  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
      <p className="af-label" style={{ marginTop: 0 }}>Landing view (on tap)</p>
      <div className="pickrow">
        {MODES.map((m) => (
          <button key={m.key} type="button" title={m.hint}
            className={`pickchip${mode === m.key ? ' on' : ''}`} onClick={() => setMode(m.key)}>{m.label}</button>
        ))}
      </div>
      <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>{MODES.find((m) => m.key === mode)?.hint}</p>

      {mode !== 'small' && (
        <div style={{ marginTop: 12, background: 'rgba(107,75,192,.04)', border: '1px solid var(--line)', borderRadius: 12, padding: 14 }}>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 12 }}>
            The landing view is designed separately from the strip above — its own words, colours and image.
          </p>

          <label className="af"><span>Landing headline</span>
            <input className="input" placeholder="Your big-screen headline" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="af" style={{ marginTop: 10 }}><span>Landing description</span>
            <textarea className="input" rows={2} placeholder="What the user sees on the full screen…" value={body} onChange={(e) => setBody(e.target.value)} /></label>

          <p className="af-label">Portrait image (9:16, fills the {mode === 'full' ? 'screen' : 'sheet'})</p>
          <ImageUpload folder="notification_images" value={portrait} onChange={setPortrait} shape="portrait" />

          <label className="af" style={{ marginTop: 12 }}><span>Button text (CTA)</span>
            <input className="input" placeholder="Recharge Now" value={cta} onChange={(e) => setCta(e.target.value)} /></label>

          <p className="af-label">Landing background &amp; text colour</p>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="color-field"><span className="muted" style={{ fontSize: 12 }}>Background</span><input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></div>
            <div className="color-field"><span className="muted" style={{ fontSize: 12 }}>Text</span><input type="color" value={fg} onChange={(e) => setFg(e.target.value)} /></div>
            <div className="pickrow">{PRESETS.map((c) => <button key={c} type="button" onClick={() => setBg(c)} style={{ width: 24, height: 24, borderRadius: 7, border: '1px solid var(--line)', background: c, cursor: 'pointer' }} />)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
