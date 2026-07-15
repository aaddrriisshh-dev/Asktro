'use client';

import { useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, orderBy, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection, Row } from '@/lib/hooks';
import { formatPaise } from '@/lib/format';
import { ImageUpload } from '@/components/ImageUpload';
import { MallNav } from '@/components/MallNav';

const emptyCat = { name: '', emoji: '', blurb: '', image: '', sortOrder: '', active: true, parentId: '' };
const emptyProd = {
  title: '', description: '', categoryId: '', priceRupees: '', mrpRupees: '',
  stock: '', sku: '', sortOrder: '', active: true, images: [] as string[],
  bestSeller: false, newLaunch: false, combo: false, rating: '', ratingCount: '',
  weightGrams: '', hsn: '', gstRate: '', dimL: '', dimB: '', dimH: '',
  specs: [] as { k: string; v: string }[],
};

const numOr0 = (s: string) => (s.trim() ? Math.max(0, Number(s) || 0) : 0);
function dimOf(p: Row, k: 'l' | 'b' | 'h') {
  const d = p.dimsCm as { l?: number; b?: number; h?: number } | undefined;
  return d && d[k] != null ? String(d[k]) : '';
}

/** AstroMall catalog — categories + products. Direct Firestore writes
 *  (admin-gated by rules), same pattern as Blogs/Banners. Photos upload to
 *  Storage; prices are entered in ₹ and stored as paise. */
export default function StorePage() {
  const { rows: cats } = useCollection('storeCategories', [orderBy('sortOrder', 'asc')]);
  const { rows: prods, loading } = useCollection('storeProducts', [orderBy('sortOrder', 'asc')]);
  const [tab, setTab] = useState<'products' | 'categories'>('products');
  const [filterCat, setFilterCat] = useState('');

  return (
    <div>
      <MallNav />
      <h1 style={{ marginBottom: 2 }}>Store Catalog</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Manage AstroMall categories &amp; products. Photos and prices update the app instantly — no rebuild.
      </p>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <button className={`btn sm ${tab === 'products' ? '' : 'secondary'}`} onClick={() => setTab('products')}>Products ({prods.length})</button>
        <button className={`btn sm ${tab === 'categories' ? '' : 'secondary'}`} onClick={() => setTab('categories')}>Categories ({cats.length})</button>
      </div>

      {tab === 'categories'
        ? <CategoriesTab cats={cats} />
        : <ProductsTab prods={prods} cats={cats} loading={loading} filterCat={filterCat} setFilterCat={setFilterCat} />}
    </div>
  );
}

/* ------------------------------- Categories ------------------------------ */
function CategoriesTab({ cats }: { cats: Row[] }) {
  const [f, setF] = useState({ ...emptyCat });
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  function edit(c: Row) {
    setEditId(c.id);
    setF({
      name: (c.name as string) ?? '', emoji: (c.emoji as string) ?? '',
      blurb: (c.blurb as string) ?? '', image: (c.image as string) ?? '',
      sortOrder: c.sortOrder != null ? String(c.sortOrder) : '', active: c.active !== false,
      parentId: (c.parentId as string) ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function reset() { setEditId(null); setF({ ...emptyCat }); }

  async function save() {
    if (!f.name.trim()) return alert('Category name is required.');
    setBusy(true);
    try {
      const payload = {
        name: f.name.trim(), emoji: f.emoji.trim(), blurb: f.blurb.trim(), image: f.image.trim(),
        sortOrder: f.sortOrder.trim() ? Math.round(Number(f.sortOrder) || 0) : (cats.length),
        parentId: f.parentId,
        active: f.active, updatedAt: serverTimestamp(),
      };
      if (editId) await updateDoc(doc(db, 'storeCategories', editId), payload);
      else await addDoc(collection(db, 'storeCategories'), { ...payload, createdAt: serverTimestamp() });
      reset();
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{editId ? 'Edit category' : 'New category'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="af"><span>Name *</span>
            <input className="input" placeholder="e.g. Gemstones" value={f.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <label className="af"><span>Emoji (fallback icon)</span>
            <input className="input" placeholder="💎" value={f.emoji} onChange={(e) => set('emoji', e.target.value)} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <label className="af"><span>Parent category</span>
            <select className="input" value={f.parentId} onChange={(e) => set('parentId', e.target.value)}>
              <option value="">— None (top-level) —</option>
              {cats.filter((c) => c.id !== editId).map((c) => (
                <option key={c.id} value={c.id}>{(c.emoji as string) || ''} {c.name as string}</option>
              ))}
            </select>
          </label>
          <label className="af"><span>Short blurb</span>
            <input className="input" placeholder="Certified astrological gemstones" value={f.blurb} onChange={(e) => set('blurb', e.target.value)} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12, marginTop: 12, alignItems: 'end' }}>
          <div>
            <p className="af-label">Category image (round tile on the app)</p>
            <ImageUpload folder="store_images" value={f.image} onChange={(url) => set('image', url)} shape="square" />
          </div>
          <label className="af"><span>Sort order</span>
            <input className="input" type="number" placeholder="0" value={f.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
          </label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 14 }}>
          <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Active (visible in the app)
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Add category'}</button>
          {editId && <button className="btn secondary" onClick={reset}>Cancel</button>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 className="celeste" style={{ marginTop: 0 }}>All categories</h3>
        {cats.length === 0 ? <p className="muted">No categories yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cardify">
              <thead><tr><th>Category</th><th>Parent</th><th>Order</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {cats.map((c) => {
                  const parent = c.parentId ? cats.find((p) => p.id === c.parentId) : null;
                  return (
                  <tr key={c.id}>
                    <td data-label="Category"><b>{parent ? '↳ ' : ''}{(c.emoji as string) || ''} {(c.name as string) || '—'}</b></td>
                    <td data-label="Parent" className="muted" style={{ fontSize: 13 }}>{parent ? (parent.name as string) : '— top level —'}</td>
                    <td data-label="Order" className="muted">{c.sortOrder as number ?? '—'}</td>
                    <td data-label="Status">
                      <button className={`btn sm ${c.active !== false ? 'secondary' : ''}`}
                        onClick={() => updateDoc(doc(db, 'storeCategories', c.id), { active: c.active === false })}>
                        {c.active !== false ? 'Active' : 'Hidden'}
                      </button>
                    </td>
                    <td data-label="" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm secondary" onClick={() => edit(c)} style={{ marginRight: 6 }}>Edit</button>
                      <button className="btn sm danger" onClick={() => { if (confirm('Delete this category? Products keep their categoryId.')) deleteDoc(doc(db, 'storeCategories', c.id)); }}>Delete</button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* -------------------------------- Products ------------------------------- */
function ProductsTab({ prods, cats, loading, filterCat, setFilterCat }: {
  prods: Row[]; cats: Row[]; loading: boolean; filterCat: string; setFilterCat: (v: string) => void;
}) {
  const [f, setF] = useState({ ...emptyProd });
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | boolean | string[]) => setF((s) => ({ ...s, [k]: v }));
  const catName = (id: string) => cats.find((c) => c.id === id)?.name as string | undefined;

  const shown = useMemo(
    () => (filterCat ? prods.filter((p) => p.categoryId === filterCat) : prods),
    [prods, filterCat],
  );

  function setImage(i: number, url: string) {
    setF((s) => {
      const imgs = [...s.images];
      if (url) imgs[i] = url; else imgs.splice(i, 1);
      return { ...s, images: imgs.filter(Boolean) };
    });
  }

  const addSpec = () => setF((s) => ({ ...s, specs: [...s.specs, { k: '', v: '' }] }));
  const removeSpec = (i: number) => setF((s) => ({ ...s, specs: s.specs.filter((_, j) => j !== i) }));
  const setSpec = (i: number, key: 'k' | 'v', val: string) =>
    setF((s) => ({ ...s, specs: s.specs.map((sp, j) => (j === i ? { ...sp, [key]: val } : sp)) }));

  function edit(p: Row) {
    setEditId(p.id);
    setF({
      title: (p.title as string) ?? '', description: (p.description as string) ?? '',
      categoryId: (p.categoryId as string) ?? '',
      priceRupees: p.pricePaise != null ? String((p.pricePaise as number) / 100) : '',
      mrpRupees: p.mrpPaise != null ? String((p.mrpPaise as number) / 100) : '',
      stock: p.stock != null ? String(p.stock) : '', sku: (p.sku as string) ?? '',
      sortOrder: p.sortOrder != null ? String(p.sortOrder) : '', active: p.active !== false,
      images: Array.isArray(p.images) ? (p.images as string[]) : [],
      bestSeller: p.bestSeller === true, newLaunch: p.newLaunch === true, combo: p.combo === true,
      rating: p.rating != null ? String(p.rating) : '',
      ratingCount: p.ratingCount != null ? String(p.ratingCount) : '',
      weightGrams: p.weightGrams != null ? String(p.weightGrams) : '',
      hsn: (p.hsnCode as string) ?? '',
      gstRate: p.gstRate != null ? String(p.gstRate) : '',
      dimL: dimOf(p, 'l'), dimB: dimOf(p, 'b'), dimH: dimOf(p, 'h'),
      specs: Array.isArray(p.specs)
        ? (p.specs as { k: string; v: string }[]).map((s) => ({ k: s.k ?? '', v: s.v ?? '' }))
        : [],
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function reset() { setEditId(null); setF({ ...emptyProd }); }

  async function save() {
    if (!f.title.trim()) return alert('Product title is required.');
    if (!f.categoryId) return alert('Pick a category.');
    const price = Math.round(Number(f.priceRupees) * 100);
    if (!price || price <= 0) return alert('Enter a valid price (₹).');
    setBusy(true);
    try {
      const payload = {
        title: f.title.trim(), description: f.description.trim(),
        categoryId: f.categoryId, categoryName: catName(f.categoryId) ?? '',
        pricePaise: price,
        mrpPaise: f.mrpRupees.trim() ? Math.round(Number(f.mrpRupees) * 100) : price,
        stock: f.stock.trim() ? Math.max(0, Math.round(Number(f.stock) || 0)) : 100,
        sku: f.sku.trim(), images: f.images.filter(Boolean),
        sortOrder: f.sortOrder.trim() ? Math.round(Number(f.sortOrder) || 0) : shown.length,
        bestSeller: f.bestSeller, newLaunch: f.newLaunch, combo: f.combo,
        rating: f.rating.trim() ? Math.min(5, Math.max(0, Number(f.rating) || 4.8)) : 4.8,
        ratingCount: f.ratingCount.trim() ? Math.max(0, Math.round(Number(f.ratingCount) || 0)) : 0,
        weightGrams: f.weightGrams.trim() ? Math.max(0, Math.round(Number(f.weightGrams) || 0)) : 0,
        hsnCode: f.hsn.trim(),
        gstRate: f.gstRate.trim() ? Math.max(0, Number(f.gstRate) || 0) : 0,
        dimsCm: { l: numOr0(f.dimL), b: numOr0(f.dimB), h: numOr0(f.dimH) },
        specs: f.specs.filter((s) => s.k.trim()).map((s) => ({ k: s.k.trim(), v: s.v.trim() })),
        active: f.active, updatedAt: serverTimestamp(),
      };
      if (editId) await updateDoc(doc(db, 'storeProducts', editId), payload);
      else await addDoc(collection(db, 'storeProducts'), { ...payload, createdAt: serverTimestamp() });
      reset();
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  const imgSlots = [0, 1, 2, 3];

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{editId ? 'Edit product' : 'New product'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="af"><span>Title *</span>
            <input className="input" placeholder="e.g. Yellow Sapphire (Pukhraj)" value={f.title} onChange={(e) => set('title', e.target.value)} />
          </label>
          <label className="af"><span>Category *</span>
            <select className="input" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">Select…</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{(c.emoji as string) || ''} {c.name as string}</option>)}
            </select>
          </label>
        </div>
        <label className="af" style={{ marginTop: 12 }}><span>Description</span>
          <textarea className="input" rows={3} placeholder="A short product description shown on the detail page…"
            value={f.description} onChange={(e) => set('description', e.target.value)} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
          <label className="af"><span>Price ₹ *</span>
            <input className="input" type="number" min={0} placeholder="5999" value={f.priceRupees} onChange={(e) => set('priceRupees', e.target.value)} />
          </label>
          <label className="af"><span>MRP ₹ (strike-through)</span>
            <input className="input" type="number" min={0} placeholder="8999" value={f.mrpRupees} onChange={(e) => set('mrpRupees', e.target.value)} />
          </label>
          <label className="af"><span>Stock</span>
            <input className="input" type="number" min={0} placeholder="100" value={f.stock} onChange={(e) => set('stock', e.target.value)} />
          </label>
          <label className="af"><span>Sort order</span>
            <input className="input" type="number" placeholder="0" value={f.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
          </label>
        </div>
        <label className="af" style={{ marginTop: 12 }}><span>SKU (optional)</span>
          <input className="input" placeholder="GEMSTONES_01" value={f.sku} onChange={(e) => set('sku', e.target.value)} />
        </label>

        <p className="af-label" style={{ marginTop: 14 }}>Product photos (first is the main image)</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {imgSlots.map((i) => (
            <ImageUpload key={i} folder="store_images" value={f.images[i] ?? ''} onChange={(url) => setImage(i, url)} shape="square" label="Photo" />
          ))}
        </div>

        <p className="af-label" style={{ marginTop: 16 }}>Merchandising (which storefront rails this appears in)</p>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <input type="checkbox" checked={f.bestSeller} onChange={(e) => set('bestSeller', e.target.checked)} /> ⭐ Best Seller
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <input type="checkbox" checked={f.newLaunch} onChange={(e) => set('newLaunch', e.target.checked)} /> 🆕 New Launch
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <input type="checkbox" checked={f.combo} onChange={(e) => set('combo', e.target.checked)} /> 🎁 Combo Deal
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <label className="af"><span>Rating (0–5, shown on card)</span>
            <input className="input" type="number" min={0} max={5} step={0.1} placeholder="4.8" value={f.rating} onChange={(e) => set('rating', e.target.value)} />
          </label>
          <label className="af"><span>Rating count</span>
            <input className="input" type="number" min={0} placeholder="0" value={f.ratingCount} onChange={(e) => set('ratingCount', e.target.value)} />
          </label>
        </div>

        <p className="af-label" style={{ marginTop: 16 }}>Specifications (shown as a table on the product page)</p>
        {f.specs.map((sp, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: 8, marginBottom: 8 }}>
            <input className="input" placeholder="Origin" value={sp.k} onChange={(e) => setSpec(i, 'k', e.target.value)} />
            <input className="input" placeholder="Nepal" value={sp.v} onChange={(e) => setSpec(i, 'v', e.target.value)} />
            <button className="btn sm secondary" onClick={() => removeSpec(i)}>✕</button>
          </div>
        ))}
        <button className="btn sm secondary" onClick={addSpec}>+ Add specification</button>

        <p className="af-label" style={{ marginTop: 16 }}>Invoice &amp; shipping details (internal — GST invoice + courier)</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <label className="af"><span>Weight (grams)</span>
            <input className="input" type="number" min={0} placeholder="50" value={f.weightGrams} onChange={(e) => set('weightGrams', e.target.value)} />
          </label>
          <label className="af"><span>HSN code</span>
            <input className="input" placeholder="7103" value={f.hsn} onChange={(e) => set('hsn', e.target.value)} />
          </label>
          <label className="af"><span>GST rate (%)</span>
            <input className="input" type="number" min={0} placeholder="3" value={f.gstRate} onChange={(e) => set('gstRate', e.target.value)} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
          <label className="af"><span>Length (cm)</span>
            <input className="input" type="number" min={0} placeholder="0" value={f.dimL} onChange={(e) => set('dimL', e.target.value)} />
          </label>
          <label className="af"><span>Breadth (cm)</span>
            <input className="input" type="number" min={0} placeholder="0" value={f.dimB} onChange={(e) => set('dimB', e.target.value)} />
          </label>
          <label className="af"><span>Height (cm)</span>
            <input className="input" type="number" min={0} placeholder="0" value={f.dimH} onChange={(e) => set('dimH', e.target.value)} />
          </label>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 14 }}>
          <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Active (buyable in the app)
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Add product'}</button>
          {editId && <button className="btn secondary" onClick={reset}>Cancel</button>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h3 className="celeste" style={{ margin: 0 }}>All products</h3>
          <select className="input" style={{ maxWidth: 220 }} value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
            <option value="">All categories</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name as string}</option>)}
          </select>
        </div>
        {loading ? <p className="muted">Loading…</p> : shown.length === 0 ? <p className="muted">No products.</p> : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table className="cardify">
              <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Product">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {Array.isArray(p.images) && p.images[0]
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={p.images[0] as string} alt="" style={{ width: 38, height: 38, borderRadius: 8, objectFit: 'cover' }} />
                          : <span style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--surface,#f1f1f4)', display: 'grid', placeItems: 'center' }}>🛍️</span>}
                        <b>{(p.title as string) || '—'}</b>
                      </div>
                    </td>
                    <td data-label="Category" className="muted" style={{ fontSize: 13 }}>{(p.categoryName as string) || (p.categoryId as string) || '—'}</td>
                    <td data-label="Price">
                      <b>{formatPaise(p.pricePaise as number)}</b>
                      {p.mrpPaise != null && (p.mrpPaise as number) > (p.pricePaise as number) &&
                        <span className="muted" style={{ textDecoration: 'line-through', marginLeft: 6, fontSize: 12 }}>{formatPaise(p.mrpPaise as number)}</span>}
                    </td>
                    <td data-label="Stock" className="muted">{p.stock as number ?? '—'}</td>
                    <td data-label="Status">
                      <button className={`btn sm ${p.active !== false ? 'secondary' : ''}`}
                        onClick={() => updateDoc(doc(db, 'storeProducts', p.id), { active: p.active === false })}>
                        {p.active !== false ? 'Active' : 'Hidden'}
                      </button>
                    </td>
                    <td data-label="" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm secondary" onClick={() => edit(p)} style={{ marginRight: 6 }}>Edit</button>
                      <button className="btn sm danger" onClick={() => { if (confirm('Delete this product?')) deleteDoc(doc(db, 'storeProducts', p.id)); }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
