'use client';

import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection, Row } from '@/lib/hooks';
import { ImageUpload } from '@/components/ImageUpload';

/** Storefront builder — the hero banner carousel and the claim strip shown on
 *  the Asktro Mall app home. Direct Firestore writes; reflects live in the app. */
export default function StorefrontPage() {
  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Storefront</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        The hero banner carousel and the scrolling claim strip at the top of the store. Updates go live instantly.
      </p>
      <div style={{ marginTop: 18 }}><HeroBanners /></div>
      <div style={{ marginTop: 24 }}><ClaimStrip /></div>
    </div>
  );
}

// ---------------- Hero banners ----------------
const emptyB = {
  image: '', headline: '', subtext: '', ctaLabel: '', linkCategoryId: '', sortOrder: '', active: true,
  textPosition: 'center', textAlign: 'left', textTheme: 'onDark', headlineScale: '1',
};

/** WYSIWYG hero preview — mirrors the app's _tile so the copy + text styling can
 *  be judged against the real image before publishing. */
function BannerPreview({ f }: { f: typeof emptyB }) {
  const scale = Math.min(1.4, Math.max(0.7, Number(f.headlineScale) || 1));
  const REF = 390, W = 340, k = W / REF;
  const onLight = f.textTheme === 'onLight';
  const centered = f.textAlign === 'center';
  const justify = f.textPosition === 'top' ? 'flex-start' : f.textPosition === 'bottom' ? 'flex-end' : 'center';
  const align = centered ? 'center' : 'flex-start';
  const scrim = onLight
    ? (centered ? 'linear-gradient(to top, rgba(251,243,224,.82), rgba(251,243,224,.25) 55%, rgba(255,255,255,0))'
      : 'linear-gradient(to right, rgba(251,243,224,.82), rgba(251,243,224,.25) 55%, rgba(255,255,255,0))')
    : (centered ? 'linear-gradient(to top, rgba(30,18,4,.69), rgba(30,18,4,.12) 55%, rgba(0,0,0,0))'
      : 'linear-gradient(to right, rgba(30,18,4,.69), rgba(30,18,4,.12) 55%, rgba(0,0,0,0))');
  const hasText = !!(f.headline || f.subtext || f.ctaLabel);
  return (
    <div style={{ width: W, maxWidth: '100%' }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '5 / 4', borderRadius: 14, overflow: 'hidden',
        border: '1px solid #e7d9b8', background: f.image ? `center/cover no-repeat url(${f.image})` : '#efe3c8' }}>
        {!f.image && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b9a98a', fontSize: 13 }}>Upload an image to preview</div>}
        {hasText && <div style={{ position: 'absolute', inset: 0, background: scrim }} />}
        {hasText && (
          <div style={{ position: 'absolute', left: 18 * k, top: 14 * k, bottom: 14 * k, right: centered ? 18 * k : undefined,
            width: centered ? undefined : 210 * k, display: 'flex', flexDirection: 'column',
            justifyContent: justify, alignItems: align, textAlign: centered ? 'center' : 'left' }}>
            {f.headline && <div style={{ fontFamily: 'Georgia, serif', fontSize: 25 * scale * k, fontWeight: 700, color: onLight ? '#2B1E08' : '#fff', lineHeight: 1.05 }}>{f.headline}</div>}
            {f.subtext && <div style={{ fontSize: 11 * k, color: onLight ? '#5A4520' : '#FBEECB', fontWeight: 500, lineHeight: 1.35, marginTop: 8 * k }}>{f.subtext}</div>}
            {f.ctaLabel && <div style={{ marginTop: 12 * k, alignSelf: centered ? 'center' : 'flex-start', background: 'linear-gradient(135deg,#F4D281,#DCA63E)', color: '#4A3208', fontSize: 11 * k, fontWeight: 800, padding: `${8 * k}px ${15 * k}px`, borderRadius: 18 }}>{f.ctaLabel}</div>}
          </div>
        )}
      </div>
      <div className="muted" style={{ fontSize: 11.5, textAlign: 'center', marginTop: 6 }}>Live preview — how the app renders it</div>
    </div>
  );
}

function Seg({ value, options, onChange }: { value: string; options: { v: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--gold,#e7d9b8)', borderRadius: 9, overflow: 'hidden' }}>
      {options.map((o, i) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: 'none',
            borderLeft: i ? '1px solid #eee1c4' : 'none',
            background: value === o.v ? 'var(--primary,#b07d16)' : '#fff', color: value === o.v ? '#fff' : '#7a6a48' }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function HeroBanners() {
  const { rows } = useCollection('storeBanners', [orderBy('sortOrder', 'asc')]);
  const { rows: cats } = useCollection('storeCategories', [orderBy('sortOrder', 'asc')]);
  const [f, setF] = useState({ ...emptyB });
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  function edit(r: Row) {
    setEditId(r.id);
    setF({
      image: (r.image as string) ?? '', headline: (r.headline as string) ?? '',
      subtext: (r.subtext as string) ?? '', ctaLabel: (r.ctaLabel as string) ?? '',
      linkCategoryId: (r.linkCategoryId as string) ?? '',
      sortOrder: r.sortOrder != null ? String(r.sortOrder) : '', active: r.active !== false,
      textPosition: (r.textPosition as string) ?? 'center',
      textAlign: (r.textAlign as string) ?? 'left',
      textTheme: (r.textTheme as string) ?? 'onDark',
      headlineScale: r.headlineScale != null ? String(r.headlineScale) : '1',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function reset() { setEditId(null); setF({ ...emptyB }); }

  async function save() {
    if (!f.image.trim()) return alert('Upload a banner image.');
    setBusy(true);
    try {
      const payload = {
        image: f.image, headline: f.headline.trim(), subtext: f.subtext.trim(),
        ctaLabel: f.ctaLabel.trim(), linkCategoryId: f.linkCategoryId,
        sortOrder: f.sortOrder.trim() ? Math.round(Number(f.sortOrder) || 0) : rows.length,
        textPosition: f.textPosition, textAlign: f.textAlign, textTheme: f.textTheme,
        headlineScale: Math.min(1.4, Math.max(0.7, Number(f.headlineScale) || 1)),
        active: f.active, updatedAt: serverTimestamp(),
      };
      if (editId) await updateDoc(doc(db, 'storeBanners', editId), payload);
      else await addDoc(collection(db, 'storeBanners'), { ...payload, createdAt: serverTimestamp() });
      reset();
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{editId ? 'Edit banner' : 'New hero banner'}</h3>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
          Tall / near-square images work best (they fill the full-width hero). Text is optional — a fully-designed image can carry it all.
        </p>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flexShrink: 0 }}><BannerPreview f={f} /></div>
          <div style={{ flex: 1, minWidth: 300 }}>
            <div style={{ marginBottom: 12 }}>
              <ImageUpload folder="store_images" value={f.image} onChange={(url) => set('image', url)} shape="wide" aspect={1.25} label="Banner image" />
            </div>
            <label className="af"><span>Headline (optional)</span>
              <input className="input" placeholder="Blessed by our Pandits" value={f.headline} onChange={(e) => set('headline', e.target.value)} />
            </label>
            <label className="af" style={{ marginTop: 12 }}><span>Subtext (optional)</span>
              <input className="input" placeholder="Energised & lab-certified, chosen for your stars." value={f.subtext} onChange={(e) => set('subtext', e.target.value)} />
            </label>
            <label className="af" style={{ marginTop: 12 }}><span>CTA label (optional)</span>
              <input className="input" placeholder="Shop the collection" value={f.ctaLabel} onChange={(e) => set('ctaLabel', e.target.value)} />
            </label>

            <p className="af-label" style={{ marginTop: 16, marginBottom: 8 }}>Text styling</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 5 }}>Position</div>
                <Seg value={f.textPosition} onChange={(v) => set('textPosition', v)}
                  options={[{ v: 'top', label: 'Top' }, { v: 'center', label: 'Center' }, { v: 'bottom', label: 'Bottom' }]} />
              </div>
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 5 }}>Align</div>
                <Seg value={f.textAlign} onChange={(v) => set('textAlign', v)}
                  options={[{ v: 'left', label: 'Left' }, { v: 'center', label: 'Center' }]} />
              </div>
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 5 }}>Text colour</div>
                <Seg value={f.textTheme} onChange={(v) => set('textTheme', v)}
                  options={[{ v: 'onDark', label: 'Light (dark image)' }, { v: 'onLight', label: 'Dark (light image)' }]} />
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 5 }}>Headline size — {Number(f.headlineScale).toFixed(2)}×</div>
              <input type="range" min={0.7} max={1.4} step={0.05} value={f.headlineScale}
                onChange={(e) => set('headlineScale', e.target.value)} style={{ width: 240, accentColor: '#c8871a' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12, marginTop: 16 }}>
              <label className="af"><span>Tapping opens (optional)</span>
                <select className="input" value={f.linkCategoryId} onChange={(e) => set('linkCategoryId', e.target.value)}>
                  <option value="">— No link —</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{(c.emoji as string) || ''} {c.name as string}</option>)}
                </select>
              </label>
              <label className="af"><span>Sort order</span>
                <input className="input" type="number" placeholder="0" value={f.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
              </label>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 14 }}>
              <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Active (shown in the app)
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Add banner'}</button>
              {editId && <button className="btn secondary" onClick={reset}>Cancel</button>}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Banners ({rows.length})</h3>
        {rows.length === 0 && <p className="muted">No banners yet — the app falls back to the built-in hero.</p>}
        {rows.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border,#eee)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {(r.image as string) && <img src={r.image as string} alt="" style={{ width: 64, height: 44, objectFit: 'cover', borderRadius: 8 }} />}
            <div style={{ flex: 1 }}>
              <strong>{(r.headline as string) || '(image only)'}</strong>
              <div className="muted" style={{ fontSize: 12 }}>{(r.subtext as string) || ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button className="btn sm secondary" onClick={() => edit(r)}>Edit</button>
              <button className={`btn sm ${r.active !== false ? 'secondary' : ''}`}
                onClick={() => updateDoc(doc(db, 'storeBanners', r.id), { active: r.active === false })}>
                {r.active !== false ? 'Active' : 'Hidden'}
              </button>
              <button className="btn sm secondary" onClick={() => confirm('Delete this banner?') && deleteDoc(doc(db, 'storeBanners', r.id))}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------- Claim strip ----------------
function ClaimStrip() {
  const [phrases, setPhrases] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'homeSections', 'storeClaims'), (snap) => {
      if (snap.exists()) {
        const d = snap.data() as { phrases?: string[]; active?: boolean };
        setPhrases((d.phrases ?? []).filter((p) => typeof p === 'string'));
        setActive(d.active !== false);
      }
      setLoaded(true);
    });
    return unsub;
  }, []);

  const setPhrase = (i: number, v: string) => setPhrases((p) => p.map((x, j) => (j === i ? v : x)));
  const addPhrase = () => setPhrases((p) => [...p, '']);
  const removePhrase = (i: number) => setPhrases((p) => p.filter((_, j) => j !== i));

  async function save() {
    setBusy(true);
    try {
      await setDoc(doc(db, 'homeSections', 'storeClaims'), {
        type: 'claimStrip', active, phrases: phrases.map((p) => p.trim()).filter(Boolean),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  if (!loaded) return <div className="card"><p className="muted">Loading claim strip…</p></div>;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Claim strip</h3>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
        The short phrases that scroll across the dark strip under the hero. Leave empty to use the built-in defaults.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 14px', fontSize: 14 }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Show the claim strip
      </label>
      {phrases.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input className="input" value={p} placeholder="e.g. Lab certified" onChange={(e) => setPhrase(i, e.target.value)} />
          <button className="btn sm secondary" onClick={() => removePhrase(i)}>✕</button>
        </div>
      ))}
      <button className="btn sm secondary" onClick={addPhrase}>+ Add phrase</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save & publish'}</button>
        {savedAt && <span className="muted" style={{ fontSize: 13 }}>Saved at {savedAt}</span>}
      </div>
    </div>
  );
}
