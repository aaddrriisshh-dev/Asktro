'use client';

import { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection, Row } from '@/lib/hooks';
import { ImageUpload } from '@/components/ImageUpload';
import { MallNav } from '@/components/MallNav';

/** Asktro Mall storefront content — testimonials, video reels and FAQs that
 *  render on the store home. Direct Firestore writes (admin-gated by rules),
 *  same pattern as the catalog. Everything reflects in the app instantly. */
export default function StoreContentPage() {
  const [tab, setTab] = useState<'testimonials' | 'videos' | 'faqs' | 'reviews'>('testimonials');
  return (
    <div>
      <MallNav />
      <h1 style={{ marginBottom: 2 }}>Store Content</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Testimonials, videos, FAQs &amp; product reviews shown on the Asktro Mall storefront. Updates go live in the app instantly — no rebuild.
      </p>
      <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
        <button className={`btn sm ${tab === 'testimonials' ? '' : 'secondary'}`} onClick={() => setTab('testimonials')}>Testimonials</button>
        <button className={`btn sm ${tab === 'videos' ? '' : 'secondary'}`} onClick={() => setTab('videos')}>Videos</button>
        <button className={`btn sm ${tab === 'faqs' ? '' : 'secondary'}`} onClick={() => setTab('faqs')}>FAQs</button>
        <button className={`btn sm ${tab === 'reviews' ? '' : 'secondary'}`} onClick={() => setTab('reviews')}>Product Reviews</button>
      </div>
      {tab === 'testimonials' && <TestimonialsTab />}
      {tab === 'videos' && <VideosTab />}
      {tab === 'faqs' && <FaqsTab />}
      {tab === 'reviews' && <ReviewsTab />}
    </div>
  );
}

// ---------------- Testimonials ----------------
const emptyT = { name: '', location: '', avatar: '', quote: '', rating: '5', sortOrder: '', active: true };

function TestimonialsTab() {
  const { rows } = useCollection('storeTestimonials', [orderBy('sortOrder', 'asc')]);
  const [f, setF] = useState({ ...emptyT });
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  function edit(r: Row) {
    setEditId(r.id);
    setF({
      name: (r.name as string) ?? '', location: (r.location as string) ?? '',
      avatar: (r.avatar as string) ?? '', quote: (r.quote as string) ?? '',
      rating: r.rating != null ? String(r.rating) : '5',
      sortOrder: r.sortOrder != null ? String(r.sortOrder) : '', active: r.active !== false,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function reset() { setEditId(null); setF({ ...emptyT }); }

  async function save() {
    if (!f.name.trim() || !f.quote.trim()) return alert('Name and quote are required.');
    setBusy(true);
    try {
      const payload = {
        name: f.name.trim(), location: f.location.trim(), avatar: f.avatar,
        quote: f.quote.trim(),
        rating: Math.min(5, Math.max(1, Number(f.rating) || 5)),
        sortOrder: f.sortOrder.trim() ? Math.round(Number(f.sortOrder) || 0) : rows.length,
        active: f.active, updatedAt: serverTimestamp(),
      };
      if (editId) await updateDoc(doc(db, 'storeTestimonials', editId), payload);
      else await addDoc(collection(db, 'storeTestimonials'), { ...payload, createdAt: serverTimestamp() });
      reset();
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{editId ? 'Edit testimonial' : 'New testimonial'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="af"><span>Customer name *</span>
            <input className="input" placeholder="Priya Sharma" value={f.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <label className="af"><span>Location</span>
            <input className="input" placeholder="New Delhi" value={f.location} onChange={(e) => set('location', e.target.value)} />
          </label>
        </div>
        <label className="af" style={{ marginTop: 12 }}><span>Quote *</span>
          <textarea className="input" rows={3} placeholder="What the customer said…" value={f.quote} onChange={(e) => set('quote', e.target.value)} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <label className="af"><span>Rating (1–5)</span>
            <input className="input" type="number" min={1} max={5} step={1} value={f.rating} onChange={(e) => set('rating', e.target.value)} />
          </label>
          <label className="af"><span>Sort order</span>
            <input className="input" type="number" placeholder="0" value={f.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <p className="af-label">Photo (optional)</p>
          <ImageUpload folder="store_images" value={f.avatar} onChange={(url) => set('avatar', url)} shape="square" label="Avatar" />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 14 }}>
          <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Active (shown in the app)
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Add testimonial'}</button>
          {editId && <button className="btn secondary" onClick={reset}>Cancel</button>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Testimonials ({rows.length})</h3>
        {rows.length === 0 && <p className="muted">None yet.</p>}
        {rows.map((r) => (
          <div key={r.id} style={rowStyle}>
            <div style={{ flex: 1 }}>
              <strong>{r.name as string}</strong> <span className="muted">· {(r.location as string) || '—'} · {'★'.repeat(Number(r.rating) || 5)}</span>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{r.quote as string}</div>
            </div>
            <RowActions active={r.active !== false} onEdit={() => edit(r)}
              onToggle={() => updateDoc(doc(db, 'storeTestimonials', r.id), { active: r.active === false })}
              onDelete={() => confirm('Delete this testimonial?') && deleteDoc(doc(db, 'storeTestimonials', r.id))} />
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------- Videos ----------------
const emptyV = { title: '', thumb: '', url: '', duration: '', sortOrder: '', active: true };

function VideosTab() {
  const { rows } = useCollection('storeVideos', [orderBy('sortOrder', 'asc')]);
  const [f, setF] = useState({ ...emptyV });
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  function edit(r: Row) {
    setEditId(r.id);
    setF({
      title: (r.title as string) ?? '', thumb: (r.thumb as string) ?? '',
      url: (r.url as string) ?? '', duration: (r.duration as string) ?? '',
      sortOrder: r.sortOrder != null ? String(r.sortOrder) : '', active: r.active !== false,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function reset() { setEditId(null); setF({ ...emptyV }); }

  async function save() {
    if (!f.title.trim()) return alert('Title is required.');
    setBusy(true);
    try {
      const payload = {
        title: f.title.trim(), thumb: f.thumb, url: f.url.trim(), duration: f.duration.trim(),
        sortOrder: f.sortOrder.trim() ? Math.round(Number(f.sortOrder) || 0) : rows.length,
        active: f.active, updatedAt: serverTimestamp(),
      };
      if (editId) await updateDoc(doc(db, 'storeVideos', editId), payload);
      else await addDoc(collection(db, 'storeVideos'), { ...payload, createdAt: serverTimestamp() });
      reset();
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{editId ? 'Edit video' : 'New video'}</h3>
        <label className="af"><span>Title *</span>
          <input className="input" placeholder="How to wear your Rudraksha" value={f.title} onChange={(e) => set('title', e.target.value)} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <label className="af"><span>Video URL (YouTube / link)</span>
            <input className="input" placeholder="https://youtu.be/…" value={f.url} onChange={(e) => set('url', e.target.value)} />
          </label>
          <label className="af"><span>Duration label</span>
            <input className="input" placeholder="2:41" value={f.duration} onChange={(e) => set('duration', e.target.value)} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, marginTop: 12, alignItems: 'end' }}>
          <div>
            <p className="af-label">Thumbnail</p>
            <ImageUpload folder="store_images" value={f.thumb} onChange={(url) => set('thumb', url)} shape="square" label="Thumb" />
          </div>
          <label className="af"><span>Sort order</span>
            <input className="input" type="number" placeholder="0" value={f.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
          </label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 14 }}>
          <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Active (shown in the app)
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Add video'}</button>
          {editId && <button className="btn secondary" onClick={reset}>Cancel</button>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Videos ({rows.length})</h3>
        {rows.length === 0 && <p className="muted">None yet.</p>}
        {rows.map((r) => (
          <div key={r.id} style={rowStyle}>
            <div style={{ flex: 1 }}>
              <strong>{r.title as string}</strong> <span className="muted">· {(r.duration as string) || '—'}</span>
              <div className="muted" style={{ fontSize: 12 }}>{(r.url as string) || 'no link'}</div>
            </div>
            <RowActions active={r.active !== false} onEdit={() => edit(r)}
              onToggle={() => updateDoc(doc(db, 'storeVideos', r.id), { active: r.active === false })}
              onDelete={() => confirm('Delete this video?') && deleteDoc(doc(db, 'storeVideos', r.id))} />
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------- FAQs ----------------
const emptyF = { question: '', answer: '', sortOrder: '', active: true };

function FaqsTab() {
  const { rows } = useCollection('storeFaqs', [orderBy('sortOrder', 'asc')]);
  const [f, setF] = useState({ ...emptyF });
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  function edit(r: Row) {
    setEditId(r.id);
    setF({
      question: (r.question as string) ?? '', answer: (r.answer as string) ?? '',
      sortOrder: r.sortOrder != null ? String(r.sortOrder) : '', active: r.active !== false,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function reset() { setEditId(null); setF({ ...emptyF }); }

  async function save() {
    if (!f.question.trim() || !f.answer.trim()) return alert('Question and answer are required.');
    setBusy(true);
    try {
      const payload = {
        question: f.question.trim(), answer: f.answer.trim(),
        sortOrder: f.sortOrder.trim() ? Math.round(Number(f.sortOrder) || 0) : rows.length,
        active: f.active, updatedAt: serverTimestamp(),
      };
      if (editId) await updateDoc(doc(db, 'storeFaqs', editId), payload);
      else await addDoc(collection(db, 'storeFaqs'), { ...payload, createdAt: serverTimestamp() });
      reset();
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{editId ? 'Edit FAQ' : 'New FAQ'}</h3>
        <label className="af"><span>Question *</span>
          <input className="input" placeholder="Are your gemstones certified?" value={f.question} onChange={(e) => set('question', e.target.value)} />
        </label>
        <label className="af" style={{ marginTop: 12 }}><span>Answer *</span>
          <textarea className="input" rows={3} placeholder="The answer shown when expanded…" value={f.answer} onChange={(e) => set('answer', e.target.value)} />
        </label>
        <label className="af" style={{ marginTop: 12, maxWidth: 200 }}><span>Sort order</span>
          <input className="input" type="number" placeholder="0" value={f.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 14 }}>
          <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Active (shown in the app)
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Add FAQ'}</button>
          {editId && <button className="btn secondary" onClick={reset}>Cancel</button>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>FAQs ({rows.length})</h3>
        {rows.length === 0 && <p className="muted">None yet.</p>}
        {rows.map((r) => (
          <div key={r.id} style={rowStyle}>
            <div style={{ flex: 1 }}>
              <strong>{r.question as string}</strong>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{r.answer as string}</div>
            </div>
            <RowActions active={r.active !== false} onEdit={() => edit(r)}
              onToggle={() => updateDoc(doc(db, 'storeFaqs', r.id), { active: r.active === false })}
              onDelete={() => confirm('Delete this FAQ?') && deleteDoc(doc(db, 'storeFaqs', r.id))} />
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------- Product Reviews ----------------
const emptyR = { name: '', rating: '5', title: '', body: '', verified: true };

/** Recompute a product's rating + count from its approved reviews. */
async function recomputeRating(pid: string) {
  const snap = await getDocs(query(collection(db, `storeProducts/${pid}/reviews`), where('status', '==', 'approved')));
  const ratings = snap.docs.map((d) => Number(d.data().rating) || 0).filter((r) => r > 0);
  const count = ratings.length;
  const avg = count ? Math.round((ratings.reduce((a, b) => a + b, 0) / count) * 10) / 10 : 4.8;
  await updateDoc(doc(db, 'storeProducts', pid), { rating: avg, ratingCount: count });
}

function ReviewsTab() {
  const { rows: prods } = useCollection('storeProducts', [orderBy('title', 'asc')]);
  const [pid, setPid] = useState('');
  const path = pid ? `storeProducts/${pid}/reviews` : 'storeProducts/__none__/reviews';
  const { rows: reviews } = useCollection(path);
  const [f, setF] = useState({ ...emptyR });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  async function add() {
    if (!pid) return alert('Pick a product first.');
    if (!f.name.trim() || !f.body.trim()) return alert('Reviewer name and review text are required.');
    setBusy(true);
    try {
      await addDoc(collection(db, `storeProducts/${pid}/reviews`), {
        name: f.name.trim(), rating: Math.min(5, Math.max(1, Number(f.rating) || 5)),
        title: f.title.trim(), body: f.body.trim(), verified: f.verified,
        status: 'approved', createdAt: serverTimestamp(),
      });
      await recomputeRating(pid);
      setF({ ...emptyR });
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  async function del(rid: string) {
    if (!confirm('Delete this review?')) return;
    await deleteDoc(doc(db, `storeProducts/${pid}/reviews`, rid));
    await recomputeRating(pid);
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add a review</h3>
        <label className="af"><span>Product *</span>
          <select className="input" value={pid} onChange={(e) => setPid(e.target.value)}>
            <option value="">Select a product…</option>
            {prods.map((p) => <option key={p.id} value={p.id}>{p.title as string}</option>)}
          </select>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <label className="af"><span>Reviewer name *</span>
            <input className="input" placeholder="Ananya Iyer" value={f.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <label className="af"><span>Rating (1–5)</span>
            <input className="input" type="number" min={1} max={5} step={1} value={f.rating} onChange={(e) => set('rating', e.target.value)} />
          </label>
        </div>
        <label className="af" style={{ marginTop: 12 }}><span>Title (optional)</span>
          <input className="input" placeholder="Beautiful & authentic" value={f.title} onChange={(e) => set('title', e.target.value)} />
        </label>
        <label className="af" style={{ marginTop: 12 }}><span>Review *</span>
          <textarea className="input" rows={3} placeholder="What the reviewer said…" value={f.body} onChange={(e) => set('body', e.target.value)} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 14 }}>
          <input type="checkbox" checked={f.verified} onChange={(e) => set('verified', e.target.checked)} /> Verified buyer badge
        </label>
        <div style={{ marginTop: 16 }}>
          <button className="btn" disabled={busy || !pid} onClick={add}>{busy ? 'Saving…' : 'Add review'}</button>
        </div>
      </div>

      {pid && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Reviews ({reviews.length})</h3>
          {reviews.length === 0 && <p className="muted">No reviews for this product yet.</p>}
          {reviews.map((r) => (
            <div key={r.id} style={rowStyle}>
              <div style={{ flex: 1 }}>
                <strong>{r.name as string}</strong> <span className="muted">· {'★'.repeat(Number(r.rating) || 5)}{(r.verified ? ' · ✓ verified' : '')}</span>
                {(r.title as string) && <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{r.title as string}</div>}
                <div className="muted" style={{ fontSize: 13 }}>{r.body as string}</div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <button className="btn sm secondary" onClick={() => del(r.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------- shared ----------------
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderTop: '1px solid var(--border, #eee)',
};

function RowActions({ active, onEdit, onToggle, onDelete }: {
  active: boolean; onEdit: () => void; onToggle: () => void; onDelete: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
      <button className="btn sm secondary" onClick={onEdit}>Edit</button>
      <button className={`btn sm ${active ? 'secondary' : ''}`} onClick={onToggle}>{active ? 'Active' : 'Hidden'}</button>
      <button className="btn sm secondary" onClick={onDelete}>Delete</button>
    </div>
  );
}
