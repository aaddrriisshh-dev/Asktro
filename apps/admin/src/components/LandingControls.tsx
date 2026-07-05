'use client';

import { ImageUpload } from '@/components/ImageUpload';

export type DisplayMode = 'small' | 'half' | 'full';

const MODES: { key: DisplayMode; label: string; hint: string }[] = [
  { key: 'small', label: 'Small only', hint: 'Just the notification / strip' },
  { key: 'half', label: 'Half-screen', hint: 'Opens a bottom sheet on tap' },
  { key: 'full', label: 'Full-screen', hint: '9:16 portrait fills the phone' },
];

/** Composer controls for the "what happens when the user taps" landing view.
 *  Shared by the Push, Banner and Coupon composers. */
export function LandingControls({
  mode, setMode, portrait, setPortrait, cta, setCta,
}: {
  mode: DisplayMode;
  setMode: (m: DisplayMode) => void;
  portrait: string;
  setPortrait: (url: string) => void;
  cta: string;
  setCta: (v: string) => void;
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
        <>
          <p className="af-label">Portrait image (9:16, fills the {mode === 'full' ? 'screen' : 'sheet'})</p>
          <ImageUpload folder="notification_images" value={portrait} onChange={setPortrait} shape="portrait" />
          <label className="af" style={{ marginTop: 12 }}><span>Button text (CTA)</span>
            <input className="input" placeholder="Recharge Now" value={cta} onChange={(e) => setCta(e.target.value)} /></label>
        </>
      )}
    </div>
  );
}
