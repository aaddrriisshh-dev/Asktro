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
const emptyB = { image: '', headline: '', subtext: '', ctaLabel: '', linkCategoryId: '', sortOrder: '', active: true };

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
        <div style={{ marginBottom: 12 }}>
          <ImageUpload folder="store_images" value={f.image} onChange={(url) => set('image', url)} shape="square" label="Banner image" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="af"><span>Headline (optional)</span>
            <input className="input" placeholder="Blessed by our Pandits" value={f.headline} onChange={(e) => set('headline', e.target.value)} />
          </label>
          <label className="af"><span>CTA label (optional)</span>
            <input className="input" placeholder="Shop the collection" value={f.ctaLabel} onChange={(e) => set('ctaLabel', e.target.value)} />
          </label>
        </div>
        <label className="af" style={{ marginTop: 12 }}><span>Subtext (optional)</span>
          <input className="input" placeholder="Energised & lab-certified, chosen for your stars." value={f.subtext} onChange={(e) => set('subtext', e.target.value)} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12, marginTop: 12 }}>
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
