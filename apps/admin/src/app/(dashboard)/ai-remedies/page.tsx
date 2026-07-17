'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { where } from 'firebase/firestore';
import { useCollection, callFn, Row } from '@/lib/hooks';

const fmt = (t: unknown) => {
  const ms = (t as { toMillis?: () => number })?.toMillis?.();
  return ms ? new Date(ms).toLocaleString('en-IN') : '—';
};
const msOf = (t: unknown) => (t as { toMillis?: () => number })?.toMillis?.() ?? 0;
const byOldest = (a: Row, b: Row) => msOf(a.questionAt) - msOf(b.questionAt); // FIFO — oldest waiting first

/** One pending AI-remedy follow-up: the remedy, the customer's question, and a
 *  reply box. The admin answers AS the AI astrologer; the reply lands back on
 *  the remedy and the customer is notified — identical to a human astrologer. */
function RemedyQuestion({ r }: { r: Row }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const astro = (r.astrologerName as string) || 'AI Astrologer';
  const title = (r.title as string) || 'Remedy';
  const note = (r.note as string) || '';
  const question = (r.question as string) || '';

  async function send() {
    const a = answer.trim();
    if (!a) return;
    setBusy(true);
    try {
      await callFn('answerAiRemedyQuestion', { remedyId: r.id, answer: a });
      setDone(true);
    } catch (e) {
      alert('Failed: ' + ((e as Error).message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card" style={{ marginTop: 12, borderLeft: '3px solid #3cb371' }}>
        <span className="muted" style={{ fontSize: 13 }}>✓ Reply sent to the customer for “{title}”.</span>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span className="badge purple" style={{ fontSize: 10 }}>AI</span>
          <strong style={{ fontSize: 14 }}>{astro}</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            · for <Link href={`/users/${r.customerId}`}>{(r.customerId as string)?.slice(0, 10) ?? '—'}</Link>
          </span>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>{fmt(r.questionAt)}</span>
      </div>

      {/* The remedy this question is about */}
      <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'linear-gradient(135deg,#f3ecff,#fff6e2)', border: '1px solid #efe0c2' }}>
        <div style={{ fontWeight: 700, color: '#6a5acd', fontSize: 13.5 }}>🪔 {title}</div>
        {note ? <div className="muted" style={{ marginTop: 3, fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{note}</div> : null}
      </div>

      {/* The customer's question */}
      <div style={{ marginTop: 10 }}>
        <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>Customer asked</div>
        <div style={{ marginTop: 4, fontSize: 14, whiteSpace: 'pre-wrap' }}>{question}</div>
      </div>

      {/* The reply box */}
      <textarea
        className="input"
        style={{ marginTop: 10, width: '100%', minHeight: 84, resize: 'vertical', fontSize: 13.5 }}
        placeholder={`Reply as ${astro} — clear, warm, in their voice…`}
        maxLength={600}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <span className="muted" style={{ fontSize: 11.5 }}>{answer.length}/600 · lands on the customer’s remedy</span>
        <button className="btn sm" disabled={busy || !answer.trim()} onClick={send}>
          {busy ? 'Sending…' : 'Send reply'}
        </button>
      </div>
    </div>
  );
}

export default function AiRemediesPage() {
  const pendingC = useMemo(() => [where('pendingPortal', '==', true)], []);
  const { rows, loading } = useCollection('remedies', pendingC);
  const queue = [...rows].sort(byOldest);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>🪔 AI Remedy Questions</h1>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Follow-up questions customers asked on an AI astrologer’s remedy. Answer as that astrologer — the reply reaches the customer on their remedy.
          </p>
        </div>
        <span className="udet-total">{queue.length}</span>
      </div>

      {loading ? (
        <p className="muted" style={{ marginTop: 16 }}>Loading…</p>
      ) : queue.length === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="drawer-muted" style={{ margin: 0 }}>No pending questions right now. 🌙</p>
        </div>
      ) : (
        queue.map((r) => <RemedyQuestion key={r.id} r={r} />)
      )}
    </div>
  );
}
