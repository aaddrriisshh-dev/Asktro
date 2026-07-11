'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection } from '@/lib/hooks';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/format';
import { MobileSection } from '@/components/MobileSection';

const PAGES = [
  { id: 'privacy', label: 'Privacy Policy', icon: '🔒' },
  { id: 'terms', label: 'Terms of Service', icon: '📜' },
  { id: 'refund', label: 'Refund Policy', icon: '↩️' },
  { id: 'about', label: 'About Us', icon: '✦' },
  { id: 'contact', label: 'Contact Us', icon: '✉️' },
  { id: 'faq', label: 'FAQ', icon: '❓' },
] as const;

type Target = 'web' | 'app' | 'both';
const TARGETS: { key: Target; label: string; icon: string }[] = [
  { key: 'both', label: 'Website + App', icon: '🌐' },
  { key: 'web', label: 'Website only', icon: '💻' },
  { key: 'app', label: 'App only', icon: '📱' },
];
const TARGET_LABEL: Record<Target, string> = { both: 'Website + App', web: 'Website', app: 'App' };

/** Tiny, safe Markdown → HTML for the live preview (escapes first). */
function mdToHtml(src: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
  const out: string[] = [];
  let inList = false;
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
  for (const raw of src.split('\n')) {
    const line = raw.trimEnd();
    if (/^### /.test(line)) { closeList(); out.push(`<h3>${inline(line.slice(4))}</h3>`); }
    else if (/^## /.test(line)) { closeList(); out.push(`<h2>${inline(line.slice(3))}</h2>`); }
    else if (/^# /.test(line)) { closeList(); out.push(`<h1>${inline(line.slice(2))}</h1>`); }
    else if (/^[-*] /.test(line)) { if (!inList) { out.push('<ul>'); inList = true; } out.push(`<li>${inline(line.slice(2))}</li>`); }
    else if (line.trim() === '') { closeList(); }
    else { closeList(); out.push(`<p>${inline(line)}</p>`); }
  }
  closeList();
  return out.join('\n');
}

export default function CmsPage() {
  const { rows } = useCollection('cms');
  const { adminName } = useAuth();
  const byId = new Map(rows.map((r) => [r.id, r]));

  const [active, setActive] = useState<string>(PAGES[0].id);
  const [content, setContent] = useState('');
  const [target, setTarget] = useState<Target>('both');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true); setSaved(false);
    getDoc(doc(db, 'cms', active)).then((s) => {
      setContent((s.data()?.content as string) ?? '');
      setTarget(((s.data()?.target as Target) ?? 'both'));
      setLoading(false);
    });
  }, [active]);

  async function publish() {
    setBusy(true);
    try {
      await setDoc(doc(db, 'cms', active), {
        content, target, updatedByName: adminName || null, updatedAt: serverTimestamp(),
      }, { merge: true });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  const activePage = PAGES.find((p) => p.id === active)!;

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>CMS</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Edit legal &amp; help content, choose where it publishes, preview it, then Commit &amp; Push — live in the apps &amp; site without an update.</p>

      <MobileSection title="Content pages" defaultOpen={true}>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,220px) minmax(0,1fr)', gap: 18, marginTop: 16, alignItems: 'start' }}>
        {/* Page list */}
        <div className="card sess-col" style={{ padding: 10 }}>
          <div className="sess-col-head" style={{ padding: '4px 6px 8px' }}>
            <h3 className="celeste" style={{ margin: 0, fontSize: 15 }}>Pages</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {PAGES.map((p) => {
              const meta = byId.get(p.id);
              const on = active === p.id;
              return (
                <button key={p.id} type="button" className={`cms-page${on ? ' on' : ''}`} onClick={() => setActive(p.id)}>
                  <span className="cms-page-ic">{p.icon}</span>
                  <span style={{ minWidth: 0, textAlign: 'left' }}>
                    <span className="cms-page-name">{p.label}</span>
                    <span className="cms-page-meta">
                      {meta?.updatedAt?.toMillis ? `Updated ${formatDate(meta.updatedAt.toMillis())}` : 'Not published yet'}
                    </span>
                  </span>
                  {meta?.target ? <span className="badge purple" style={{ fontSize: 9 }}>{TARGET_LABEL[(meta.target as Target)] ?? 'Both'}</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Editor + preview */}
        <div>
          <div className="card">
            <div className="uat-head" style={{ marginBottom: 12 }}>
              <h3 className="celeste" style={{ margin: 0 }}>{activePage.icon} {activePage.label}</h3>
              <div className="pickrow">
                {TARGETS.map((t) => <button key={t.key} type="button" className={`pickchip${target === t.key ? ' on' : ''}`} onClick={() => setTarget(t.key)}>{t.icon} {t.label}</button>)}
              </div>
            </div>

            {loading ? <p className="muted">Loading…</p> : (
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <p className="af-label" style={{ marginTop: 0 }}>Content (Markdown)</p>
                  <textarea className="input" value={content} onChange={(e) => setContent(e.target.value)} rows={20}
                    style={{ fontFamily: 'monospace', lineHeight: 1.55, fontSize: 13 }}
                    placeholder="# Heading&#10;&#10;Your policy text… **bold**, *italic*, [links](https://…), and&#10;- bullet points" />
                </div>
                <div>
                  <p className="af-label" style={{ marginTop: 0 }}>Live preview</p>
                  <div className="cms-preview">
                    {content.trim()
                      ? <div dangerouslySetInnerHTML={{ __html: mdToHtml(content) }} />
                      : <p className="muted">Your formatted page appears here as you type.</p>}
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn" disabled={busy || loading} onClick={publish}>{busy ? 'Publishing…' : '⚡ Commit & Push'}</button>
              {saved && <span style={{ color: 'var(--success)', fontWeight: 600 }}>Published to {TARGET_LABEL[target]} ✓</span>}
              {byId.get(active)?.updatedByName ? (
                <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>Last edited by <b>{String(byId.get(active)!.updatedByName)}</b></span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      </MobileSection>
    </div>
  );
}
