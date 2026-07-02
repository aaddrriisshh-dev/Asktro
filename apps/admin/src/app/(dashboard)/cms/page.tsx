'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const PAGES = [
  { id: 'privacy', label: 'Privacy Policy' },
  { id: 'terms', label: 'Terms of Service' },
  { id: 'refund', label: 'Refund Policy' },
  { id: 'about', label: 'About Us' },
  { id: 'contact', label: 'Contact Us' },
  { id: 'faq', label: 'FAQ' },
];

export default function CmsPage() {
  const [active, setActive] = useState(PAGES[0].id);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    setSaved(false);
    getDoc(doc(db, 'cms', active)).then((s) => {
      setContent((s.data()?.content as string) ?? '');
      setLoading(false);
    });
  }, [active]);

  async function save() {
    await setDoc(doc(db, 'cms', active), { content, updatedAt: serverTimestamp() }, { merge: true });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div>
      <h1>CMS</h1>
      <p className="muted">Edit legal & help content — changes reflect in the apps without an update.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {PAGES.map((p) => (
          <button
            key={p.id}
            className={`btn sm ${active === p.id ? '' : 'secondary'}`}
            onClick={() => setActive(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <textarea
              className="input"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={16}
              style={{ fontFamily: 'monospace', lineHeight: 1.5 }}
              placeholder="Write the page content (Markdown supported by the apps)…"
            />
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={save}>Save page</button>
              {saved && <span style={{ marginLeft: 12, color: 'var(--success)' }}>Saved ✓</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
