'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ImageUpload } from '@/components/ImageUpload';
import { PROMO_THEMES } from '@/lib/promoThemes';

type Audience = 'all' | 'paid' | 'unpaid';
type DisplayMode = 'small' | 'half' | 'full';

interface PopupDoc {
  active: boolean;
  audience: Audience;
  displayMode: DisplayMode;
  theme: string; // '' = plain centre card, no theme
  title: string;
  body: string;
  ctaLabel: string;
  deeplink: string;
  code: string;
  image: string;
  imageStyle: 'banner' | 'portrait';
  imageFill: boolean;
}

const DEFAULTS: PopupDoc = {
  active: false,
  audience: 'all',
  displayMode: 'small',
  theme: '',
  title: '',
  body: '',
  ctaLabel: 'Grab this offer',
  deeplink: '',
  code: '',
  image: '',
  imageStyle: 'banner',
  imageFill: false,
};

/** The current ₹77 welcome offer expressed as a reusable pop-up preset, so it
 *  can be re-used / tweaked from here instead of being hard-coded in the app. */
const WELCOME_77_PRESET: Partial<PopupDoc> = {
  audience: 'unpaid',
  displayMode: 'full',
  theme: 'golden',
  title: 'Triple Dhamaka',
  body: 'Get ₹77 in your wallet — grab this one-time welcome offer and start your first reading.',
  ctaLabel: 'Recharge ₹29.5',
  deeplink: '/recharge?plan=promo_welcome',
  code: '',
  image: '',
  imageStyle: 'banner',
  imageFill: false,
};

/** Home Pop-up Banner → a portal-managed pop-up that greets people on app open.
 *  Writes the single `homeSections/popup` doc; the app reads it live (no rebuild)
 *  and shows it once per launch to the chosen audience (paid / unpaid / all). */
export default function HomePopupPage() {
  const [form, setForm] = useState<PopupDoc>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const ref = doc(db, 'homeSections', 'popup');
    return onSnapshot(ref, (snap) => {
      const d = (snap.data() ?? {}) as Partial<PopupDoc>;
      setForm({
        active: d.active ?? false,
        audience: (d.audience as Audience) ?? 'all',
        displayMode: (d.displayMode as DisplayMode) ?? 'small',
        theme: d.theme ?? '',
        title: d.title ?? '',
        body: d.body ?? '',
        ctaLabel: d.ctaLabel ?? 'Grab this offer',
        deeplink: d.deeplink ?? '',
        code: d.code ?? '',
        image: d.image ?? '',
        imageStyle: (d.imageStyle as 'banner' | 'portrait') ?? 'banner',
        imageFill: d.imageFill ?? false,
      });
      setLoaded(true);
    });
  }, []);

  const set = <K extends keyof PopupDoc>(k: K, v: PopupDoc[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'homeSections', 'popup'),
        {
          active: form.active,
          audience: form.audience,
          displayMode: form.displayMode,
          theme: form.theme,
          title: form.title.trim(),
          body: form.body.trim(),
          ctaLabel: form.ctaLabel.trim() || 'Grab this offer',
          deeplink: form.deeplink.trim(),
          code: form.code.trim(),
          image: form.image,
          imageStyle: form.imageStyle,
          imageFill: form.imageFill,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setSavedAt(new Date().toLocaleTimeString());
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <p className="muted">Loading…</p>;

  const audiences: [Audience, string][] = [
    ['all', 'Everyone'],
    ['unpaid', 'Only unpaid (never recharged)'],
    ['paid', 'Only paid (has recharged)'],
  ];

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ marginBottom: 2 }}>Home Pop-up Banner</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        A pop-up that greets people when they open the app. Target paid or unpaid users, choose the look,
        add an image and a button. Changes go live instantly — no rebuild. Shown once per app launch.
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 8px' }}>
        <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
        <strong>Show this pop-up on the home screen</strong>
      </label>

      <div className="card" style={{ padding: 16, display: 'grid', gap: 14 }}>
        <Field label="Who sees it">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {audiences.map(([v, l]) => (
              <button
                key={v}
                type="button"
                className={`btn sm ${form.audience === v ? '' : 'secondary'}`}
                onClick={() => set('audience', v)}
              >
                {l}
              </button>
            ))}
          </div>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Style">
            <select className="input" value={form.displayMode} onChange={(e) => set('displayMode', e.target.value as DisplayMode)}>
              <option value="small">Centre card (compact)</option>
              <option value="half">Bottom sheet (half)</option>
              <option value="full">Full takeover</option>
            </select>
          </Field>
          <Field label="Theme (colour look)">
            <select className="input" value={form.theme} onChange={(e) => set('theme', e.target.value)}>
              <option value="">Plain (no theme)</option>
              {PROMO_THEMES.map((t) => (
                <option key={t.id} value={t.id}>{t.medal} {t.name}</option>
              ))}
            </select>
          </Field>
        </div>
        {form.displayMode !== 'small' && !form.theme && (
          <span className="muted" style={{ fontSize: 11.5, color: 'var(--error)' }}>
            Half &amp; full styles need a theme — pick one, or the app falls back to the compact centre card.
          </span>
        )}

        <Field label="Title">
          <input className="input" value={form.title} placeholder="A gift for you" onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Message">
          <textarea
            className="input"
            style={{ minHeight: 60, resize: 'vertical' }}
            value={form.body}
            placeholder="Recharge today and get extra wallet credit."
            onChange={(e) => set('body', e.target.value)}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Button label">
            <input className="input" value={form.ctaLabel} placeholder="Grab this offer" onChange={(e) => set('ctaLabel', e.target.value)} />
          </Field>
          <Field label="Coupon code pill (optional)">
            <input className="input" value={form.code} placeholder="WELCOME50" onChange={(e) => set('code', e.target.value)} />
          </Field>
        </div>

        <Field label="Button opens (deep link — e.g. /recharge, /store, /wallet)">
          <input className="input" value={form.deeplink} placeholder="/recharge" onChange={(e) => set('deeplink', e.target.value)} />
        </Field>

        <Field label="Image (optional)">
          <ImageUpload
            folder="promo_images"
            value={form.image}
            onChange={(url) => set('image', url)}
            shape={form.imageStyle === 'portrait' ? 'portrait' : 'wide'}
            label="Upload image"
          />
        </Field>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="radio" name="imgstyle" checked={form.imageStyle === 'banner'} onChange={() => set('imageStyle', 'banner')} /> Wide banner
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="radio" name="imgstyle" checked={form.imageStyle === 'portrait'} onChange={() => set('imageStyle', 'portrait')} /> Tall portrait
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={form.imageFill} onChange={(e) => set('imageFill', e.target.checked)} /> Image fills the whole pop-up (fully-designed art)
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <button className="btn sm secondary" onClick={() => setForm((f) => ({ ...f, ...WELCOME_77_PRESET }))}>
          ⤵ Load the ₹77 Welcome preset
        </button>
        <span className="muted" style={{ fontSize: 12 }}>Fills the fields with the current ₹77 welcome offer — tweak &amp; save.</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save & publish'}
        </button>
        {savedAt && <span className="muted" style={{ fontSize: 13 }}>Saved at {savedAt}</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      {children}
    </label>
  );
}
