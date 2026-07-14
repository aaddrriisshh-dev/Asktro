'use client';

import { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, orderBy, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection, Row } from '@/lib/hooks';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/format';
import { ImageUpload } from '@/components/ImageUpload';

const empty = { title: '', excerpt: '', content: '', coverImage: '', views: '', published: true };

/** Blogs / "Asktro Journal" management — authored here, shown on the app home.
 *  Direct Firestore writes (admin-gated by rules), same pattern as banners. */
export default function BlogsPage() {
  const { rows, loading } = useCollection('blogs', [orderBy('createdAt', 'desc')]);
  const { user, adminName } = useAuth();
  const [f, setF] = useState({ ...empty });
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  function edit(b: Row) {
    setEditId(b.id);
    setF({
      title: (b.title as string) ?? '',
      excerpt: (b.excerpt as string) ?? '',
      content: (b.content as string) ?? '',
      coverImage: (b.coverImage as string) ?? '',
      views: b.views != null ? String(b.views) : '',
      published: b.published !== false,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function reset() {
    setEditId(null);
    setF({ ...empty });
  }

  async function save() {
    if (!f.title.trim()) return alert('Title is required.');
    if (!f.content.trim()) return alert('Content is required.');
    setBusy(true);
    try {
      const payload = {
        title: f.title.trim(),
        excerpt: f.excerpt.trim(),
        content: f.content.trim(),
        coverImage: f.coverImage.trim(),
        views: f.views.trim() ? Math.max(0, Math.round(Number(f.views) || 0)) : 0,
        published: f.published,
        author: adminName || null,
        updatedAt: serverTimestamp(),
      };
      if (editId) {
        await updateDoc(doc(db, 'blogs', editId), payload);
      } else {
        await addDoc(collection(db, 'blogs'), {
          ...payload,
          createdBy: user?.uid ?? null,
          createdAt: serverTimestamp(),
        });
      }
      reset();
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Blogs</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Write an article — it appears in the app’s “From the Asktro Journal” section on the home screen.
      </p>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>{editId ? 'Edit article' : 'New article'}</h3>

        <label className="af"><span>Title *</span>
          <input className="input" placeholder="e.g. What your Moon sign says about you"
            value={f.title} onChange={(e) => set('title', e.target.value)} />
        </label>

        <label className="af" style={{ marginTop: 12 }}><span>Excerpt (1–2 lines shown on the card)</span>
          <textarea className="input" rows={2} placeholder="A short teaser that makes people want to read…"
            value={f.excerpt} onChange={(e) => set('excerpt', e.target.value)} />
        </label>

        <label className="af" style={{ marginTop: 12 }}><span>Views (shown as an eye-count on the app card)</span>
          <input className="input" type="number" min={0} placeholder="e.g. 141950"
            value={f.views} onChange={(e) => set('views', e.target.value)} />
          <span className="muted" style={{ fontSize: 12 }}>Optional. Leave blank or 0 to hide the eye-count.</span>
        </label>

        <p className="af-label" style={{ marginTop: 12 }}>Cover image</p>
        <ImageUpload folder="blog_images" value={f.coverImage} onChange={(url) => set('coverImage', url)} shape="wide" />

        <label className="af" style={{ marginTop: 12 }}><span>Content *</span>
          <textarea className="input" rows={12} placeholder="Write the full article here. Blank lines separate paragraphs."
            value={f.content} onChange={(e) => set('content', e.target.value)} />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 14 }}>
          <input type="checkbox" checked={f.published} onChange={(e) => set('published', e.target.checked)} />
          Published (visible in the app). Uncheck to keep it as a draft.
        </label>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : editId ? 'Save changes' : '⚡ Publish article'}</button>
          {editId && <button className="btn secondary" onClick={reset}>Cancel edit</button>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 className="celeste" style={{ marginTop: 0 }}>All articles</h3>
        {loading ? <p className="muted">Loading…</p> : rows.length === 0 ? <p className="muted">No articles yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cardify">
              <thead><tr><th>Title</th><th>Author</th><th>Updated</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Title"><b>{(b.title as string) || '—'}</b></td>
                    <td data-label="Author" className="muted" style={{ fontSize: 13 }}>{(b.author as string) || '—'}</td>
                    <td data-label="Updated" className="muted" style={{ fontSize: 13 }}>
                      {b.updatedAt?.toMillis ? formatDate(b.updatedAt.toMillis()) : b.createdAt?.toMillis ? formatDate(b.createdAt.toMillis()) : '—'}
                    </td>
                    <td data-label="Status">
                      <button className={`btn sm ${b.published !== false ? 'secondary' : ''}`}
                        onClick={() => updateDoc(doc(db, 'blogs', b.id), { published: b.published === false })}>
                        {b.published !== false ? 'Published' : 'Draft'}
                      </button>
                    </td>
                    <td data-label="" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm secondary" onClick={() => edit(b)} style={{ marginRight: 6 }}>Edit</button>
                      <button className="btn sm danger" onClick={() => { if (confirm('Delete this article?')) deleteDoc(doc(db, 'blogs', b.id)); }}>Delete</button>
                    </td>
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
