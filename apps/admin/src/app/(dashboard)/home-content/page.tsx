'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ImageUpload } from '@/components/ImageUpload';

/** Icon keys the app knows how to render (see trust_banner.dart `_iconFor`). */
const ICONS: { key: string; label: string }[] = [
  { key: 'genuine', label: '🏆  Genuine / Premium' },
  { key: 'lab', label: '🔬  Lab tested' },
  { key: 'verified', label: '✅  Verified' },
  { key: 'secure', label: '🔒  Secure / Private' },
  { key: 'shield', label: '🛡️  Shield' },
  { key: 'gift', label: '🎁  Gift / Offer' },
  { key: 'support', label: '🎧  Support' },
  { key: 'delivery', label: '🚚  Delivery' },
];

interface TrustItem {
  icon: string;
  title: string;
  subtitle: string;
}

interface TrustDoc {
  active: boolean;
  title: string;
  subtitle: string;
  footer: string;
  items: TrustItem[];
}

const DEFAULTS: TrustDoc = {
  active: true,
  title: 'Why People Trust Asktro',
  subtitle: 'Real experts, real guidance, no compromises.',
  footer: 'Authentic · Verified · Confidential',
  items: [
    { icon: 'genuine', title: '100% Genuine Products', subtitle: 'Lab-tested & verified' },
    { icon: 'verified', title: 'Asktro Verified Astrologers', subtitle: 'Real experts with proven experience' },
    { icon: 'secure', title: 'Private & Confidential', subtitle: '100% secure consultations' },
  ],
};

/** Home Content → the "Why people trust Asktro" assurance band that renders on
 *  the home screen, right under the Asktro Mall store rail. Writes the single
 *  `homeSections/trust` doc; the app reflects changes live (no rebuild). */
export default function HomeContentPage() {
  const [form, setForm] = useState<TrustDoc>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const ref = doc(db, 'homeSections', 'trust');
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const d = snap.data() as Partial<TrustDoc>;
        setForm({
          active: d.active ?? true,
          title: d.title ?? '',
          subtitle: d.subtitle ?? '',
          footer: d.footer ?? '',
          items: (d.items ?? []).map((i) => ({
            icon: i.icon ?? 'genuine',
            title: i.title ?? '',
            subtitle: i.subtitle ?? '',
          })),
        });
      }
      setLoaded(true);
    });
    return unsub;
  }, []);

  const setItem = (idx: number, patch: Partial<TrustItem>) =>
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));

  const addItem = () =>
    setForm((f) => ({ ...f, items: [...f.items, { icon: 'genuine', title: '', subtitle: '' }] }));

  const removeItem = (idx: number) =>
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const move = (idx: number, dir: -1 | 1) =>
    setForm((f) => {
      const j = idx + dir;
      if (j < 0 || j >= f.items.length) return f;
      const items = [...f.items];
      [items[idx], items[j]] = [items[j], items[idx]];
      return { ...f, items };
    });

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'homeSections', 'trust'),
        {
          type: 'trust',
          position: 25,
          active: form.active,
          title: form.title.trim(),
          subtitle: form.subtitle.trim(),
          footer: form.footer.trim(),
          items: form.items
            .filter((i) => i.title.trim())
            .map((i) => ({ icon: i.icon, title: i.title.trim(), subtitle: i.subtitle.trim() })),
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

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ marginBottom: 2 }}>Home Screen Content</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        The two home-screen sections you can edit live — the Asktro Mall hero and the trust band below
        it. Changes go live in the app instantly — no rebuild.
      </p>

      <StoreHeroEditor />

      <h2 style={{ fontSize: 18, margin: '30px 0 4px' }}>Trust band</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        The &ldquo;Why people trust Asktro&rdquo; assurance strip, just below the Asktro Mall store rail.
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 8px' }}>
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
        />
        <strong>Show this band on the home screen</strong>
      </label>

      <div className="card" style={{ padding: 16, display: 'grid', gap: 12 }}>
        <Field label="Heading">
          <input
            className="input"
            value={form.title}
            placeholder="Why People Trust Asktro"
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </Field>
        <Field label="Sub-heading">
          <input
            className="input"
            value={form.subtitle}
            placeholder="Real experts, real guidance, no compromises."
            onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
          />
        </Field>
        <Field label="Footer line (avoid fake numbers)">
          <input
            className="input"
            value={form.footer}
            placeholder="Authentic · Verified · Confidential"
            onChange={(e) => setForm((f) => ({ ...f, footer: e.target.value }))}
          />
        </Field>
      </div>

      <h2 style={{ fontSize: 16, margin: '22px 0 10px' }}>Assurance rows</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        {form.items.map((it, idx) => (
          <div key={idx} className="card" style={{ padding: 14, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>Row {idx + 1}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button className="btn sm secondary" onClick={() => move(idx, -1)} disabled={idx === 0}>↑</button>
                <button className="btn sm secondary" onClick={() => move(idx, 1)} disabled={idx === form.items.length - 1}>↓</button>
                <button className="btn sm secondary" onClick={() => removeItem(idx)}>Remove</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 10 }}>
              <Field label="Icon">
                <select className="input" value={it.icon} onChange={(e) => setItem(idx, { icon: e.target.value })}>
                  {ICONS.map((ic) => (
                    <option key={ic.key} value={ic.key}>{ic.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Title">
                <input
                  className="input"
                  value={it.title}
                  placeholder="100% Genuine Products"
                  onChange={(e) => setItem(idx, { title: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Line">
              <input
                className="input"
                value={it.subtitle}
                placeholder="Lab-tested & verified"
                onChange={(e) => setItem(idx, { subtitle: e.target.value })}
              />
            </Field>
          </div>
        ))}
      </div>

      <button className="btn sm secondary" style={{ marginTop: 12 }} onClick={addItem}>+ Add row</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save & publish'}
        </button>
        {savedAt && <span className="muted" style={{ fontSize: 13 }}>Saved at {savedAt}</span>}
      </div>
    </div>
  );
}

interface StoreHeroDoc {
  image: string;
  headline: string;
  subtext: string;
  cta: string;
}

/** The premium "Asktro Mall" hero at the top of the home store rail. Writes the
 *  single `homeSections/storeHero` doc (image + copy); the app reads it live.
 *  Everything else in the hero — background, mandala, badge, and the tappable
 *  category strip — is rendered by the app from your catalog. */
function StoreHeroEditor() {
  const [form, setForm] = useState<StoreHeroDoc>({ image: '', headline: '', subtext: '', cta: '' });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const ref = doc(db, 'homeSections', 'storeHero');
    return onSnapshot(ref, (snap) => {
      const d = (snap.data() ?? {}) as Partial<StoreHeroDoc>;
      setForm({
        image: d.image ?? '',
        headline: d.headline ?? '',
        subtext: d.subtext ?? '',
        cta: d.cta ?? '',
      });
      setLoaded(true);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'homeSections', 'storeHero'),
        {
          image: form.image,
          headline: form.headline.trim(),
          subtext: form.subtext.trim(),
          cta: form.cta.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setSavedAt(new Date().toLocaleTimeString());
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>Asktro Mall hero (store rail)</h2>
      <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
        The premium banner at the top of the Mall rail. Upload the product image (a transparent PNG of the
        product cluster) and set the copy. Leave any field blank to use the app&apos;s default.
      </p>
      {!loaded ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="card" style={{ padding: 16, display: 'grid', gap: 14 }}>
          <Field label="Product image — transparent PNG (the cluster on the pedestal)">
            <ImageUpload
              folder="store_images"
              value={form.image}
              original
              onChange={(url) => setForm((f) => ({ ...f, image: url }))}
              shape="wide"
              label="Upload product PNG"
            />
          </Field>
          <Field label="Headline (the last word shows in purple)">
            <input
              className="input"
              value={form.headline}
              placeholder="Blessings for Every Aspect of Life"
              onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
            />
          </Field>
          <Field label="Subtext (keep it short — one line)">
            <input
              className="input"
              value={form.subtext}
              placeholder="Our products bring peace, positivity & prosperity."
              onChange={(e) => setForm((f) => ({ ...f, subtext: e.target.value }))}
            />
          </Field>
          <Field label="Button label">
            <input
              className="input"
              value={form.cta}
              placeholder="Explore Mall"
              onChange={(e) => setForm((f) => ({ ...f, cta: e.target.value }))}
            />
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save & publish'}
            </button>
            {savedAt && <span className="muted" style={{ fontSize: 13 }}>Saved at {savedAt}</span>}
          </div>
        </div>
      )}
    </section>
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
