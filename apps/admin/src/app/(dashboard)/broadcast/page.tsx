'use client';

import { useState } from 'react';
import { callFn } from '@/lib/hooks';

type Segment = 'all_users' | 'paid_users' | 'unpaid_users' | 'astrologers';
const AUDIENCE: { key: Segment; label: string }[] = [
  { key: 'all_users', label: 'All Users' },
  { key: 'paid_users', label: 'Paid Users' },
  { key: 'unpaid_users', label: 'Unpaid Users' },
  { key: 'astrologers', label: 'Astrologers' },
];

export default function BroadcastPage() {
  const [segment, setSegment] = useState<Segment>('all_users');
  const [f, setF] = useState({ title: '', body: '', deeplink: '', image: '' });
  const [imageStyle, setImageStyle] = useState<'banner' | 'portrait'>('banner');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function send() {
    if (!f.title.trim() || !f.body.trim()) return alert('Title and message are required.');
    const label = AUDIENCE.find((a) => a.key === segment)?.label;
    if (!confirm(`Push this notification to ${label}?`)) return;
    setBusy(true); setResult(null);
    try {
      const res = await callFn<{ delivered: number }>('sendBroadcast', {
        title: f.title.trim(), body: f.body.trim(), segment, type: 'announcement',
        deeplink: f.deeplink.trim() || undefined,
        image: f.image.trim() || undefined,
        imageStyle: f.image.trim() ? imageStyle : undefined,
      });
      setResult(`✓ Pushed to ${res.delivered} ${label}.`);
      setF({ title: '', body: '', deeplink: '', image: '' });
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Push Notifications</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Reach users on their phone. Compose, choose who gets it, then Commit &amp; Push.</p>

      <div className="card" style={{ marginTop: 16, maxWidth: 620 }}>
        <p className="af-label" style={{ marginTop: 0 }}>Audience</p>
        <div className="pickrow">
          {AUDIENCE.map((a) => (
            <button key={a.key} type="button" className={`pickchip${segment === a.key ? ' on' : ''}`} onClick={() => setSegment(a.key)}>{a.label}</button>
          ))}
        </div>

        <label className="af" style={{ marginTop: 16 }}><span>Title</span>
          <input className="input" placeholder="✨ Your stars align today" value={f.title} onChange={(e) => set('title', e.target.value)} /></label>
        <label className="af" style={{ marginTop: 12 }}><span>Description</span>
          <textarea className="input" rows={3} placeholder="Consult a top astrologer now and get guidance…" value={f.body} onChange={(e) => set('body', e.target.value)} /></label>
        <label className="af" style={{ marginTop: 12 }}><span>Deep link (optional)</span>
          <input className="input" placeholder="asktro://astrologers  or  /recharge" value={f.deeplink} onChange={(e) => set('deeplink', e.target.value)} /></label>
        <label className="af" style={{ marginTop: 12 }}><span>Image URL (optional)</span>
          <input className="input" placeholder="https://…" value={f.image} onChange={(e) => set('image', e.target.value)} /></label>

        {f.image.trim() && (
          <div style={{ marginTop: 10 }}>
            <p className="af-label" style={{ margin: '0 0 8px' }}>Image style</p>
            <div className="pickrow">
              <button type="button" className={`pickchip${imageStyle === 'banner' ? ' on' : ''}`} onClick={() => setImageStyle('banner')}>As Banner</button>
              <button type="button" className={`pickchip${imageStyle === 'portrait' ? ' on' : ''}`} onClick={() => setImageStyle('portrait')}>As Portrait</button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <button className="btn" disabled={busy} onClick={send}>{busy ? 'Pushing…' : '⚡ Commit & Push'}</button>
          {result && <span style={{ marginLeft: 12, color: 'var(--success)', fontWeight: 600 }}>{result}</span>}
        </div>
      </div>
    </div>
  );
}
