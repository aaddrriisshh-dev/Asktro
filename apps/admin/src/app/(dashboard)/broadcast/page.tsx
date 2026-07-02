'use client';

import { useState } from 'react';
import { callFn } from '@/lib/hooks';

export default function BroadcastPage() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [segment, setSegment] = useState<'all_users' | 'astrologers'>('all_users');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function send() {
    if (!title.trim() || !body.trim()) return alert('Title and body are required.');
    if (!confirm(`Send this notification to ${segment.replace('_', ' ')}?`)) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await callFn<{ delivered: number }>('sendBroadcast', {
        title: title.trim(),
        body: body.trim(),
        segment,
        type: 'announcement',
      });
      setResult(`Queued to ${res.delivered} recipients.`);
      setTitle('');
      setBody('');
    } catch (e) {
      alert('Failed: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Push Notifications</h1>
      <div className="card" style={{ maxWidth: 560 }}>
        <label className="muted" style={{ fontSize: 13 }}>Audience</label>
        <select className="input" value={segment} onChange={(e) => setSegment(e.target.value as 'all_users' | 'astrologers')} style={{ margin: '6px 0 14px' }}>
          <option value="all_users">All users</option>
          <option value="astrologers">All astrologers</option>
        </select>
        <label className="muted" style={{ fontSize: 13 }}>Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ margin: '6px 0 14px' }} />
        <label className="muted" style={{ fontSize: 13 }}>Message</label>
        <textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} rows={4} style={{ margin: '6px 0 14px' }} />
        <button className="btn" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send notification'}</button>
        {result && <p style={{ color: 'var(--success)' }}>{result}</p>}
      </div>
    </div>
  );
}
