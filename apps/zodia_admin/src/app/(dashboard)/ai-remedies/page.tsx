'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { where, limit, orderBy } from 'firebase/firestore';
import { useCollection, callFn, Row } from '@/lib/hooks';

const fmt = (t: unknown) => {
  const ms = (t as { toMillis?: () => number })?.toMillis?.();
  return ms ? new Date(ms).toLocaleString('en-IN') : '—';
};
const msOf = (t: unknown) => (t as { toMillis?: () => number })?.toMillis?.() ?? 0;

type Hook = { kind: 'product'; productId: string; title: string; cta: string };

/** Pick a product from the live storeProducts catalog to attach as a buy-hook. */
function ProductHookPicker({ onAttach, onClear, attached }: {
  onAttach: (h: Hook) => void; onClear: () => void; attached: Hook | null;
}) {
  const [open, setOpen] = useState(false);
  const [cta, setCta] = useState('View in store');
  const { rows: products } = useCollection('storeProducts', useMemo(() => [orderBy('title', 'asc'), limit(300)], []));

  if (attached) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '7px 10px', borderRadius: 9, background: '#FFF9EC', border: '1px solid #d8c9f5' }}>
        <span style={{ fontSize: 12.5 }}>🛍️ <strong>{attached.title}</strong> · “{attached.cta}”</span>
        <button className="btn sm secondary" style={{ marginLeft: 'auto' }} onClick={onClear}>Remove</button>
      </div>
    );
  }
  if (!open) {
    return (
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button className="btn sm secondary" onClick={() => setOpen(true)}>🛍️ Attach product</button>
        <button className="btn sm secondary" disabled title="Puja booking is coming soon">🪔 Attach puja (coming soon)</button>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 8, padding: 10, borderRadius: 10, border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          className="input" style={{ flex: 1, minWidth: 180, fontSize: 13, padding: '7px 10px' }}
          defaultValue=""
          onChange={(e) => {
            const p = products.find((x) => x.id === e.target.value);
            if (p) onAttach({ kind: 'product', productId: p.id, title: (p.title as string) || 'Product', cta: cta.trim() || 'View in store' });
          }}
        >
          <option value="" disabled>Choose a product…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{(p.title as string) || p.id}</option>)}
        </select>
        <input className="input" style={{ width: 150, fontSize: 13, padding: '7px 10px' }} value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Button text" />
        <button className="btn sm secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <span className="muted" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>Deep-links to the product in the app · updates as your catalog changes.</span>
    </div>
  );
}

/** A remedy conversation: the remedy, any legacy Q&A, the live thread, and a
 *  composer to message the customer (with an optional product hook). */
function RemedyThread({ r, collapsible = false }: { r: Row; collapsible?: boolean }) {
  const astro = (r.astrologerName as string) || 'AI Astrologer';
  const title = (r.title as string) || 'Remedy';
  const note = (r.note as string) || '';
  // Collapsed by default in the history list so the log stays scannable.
  const [open, setOpen] = useState(!collapsible);

  const { rows: thread } = useCollection(`remedies/${r.id}/thread`, useMemo(() => [orderBy('createdAt', 'asc'), limit(100)], []));

  const [text, setText] = useState('');
  const [hook, setHook] = useState<Hook | null>(null);
  const [busy, setBusy] = useState(false);

  // Legacy first exchange (older remedies stored a single question/answer).
  const legacy: Array<{ role: 'customer' | 'astrologer'; text: string; at: unknown }> = [];
  if (r.question) legacy.push({ role: 'customer', text: r.question as string, at: r.questionAt });
  if (r.answer) legacy.push({ role: 'astrologer', text: r.answer as string, at: r.answerAt });
  const msgs = thread.length
    ? thread.map((m) => ({ role: (m.senderRole as string) === 'astrologer' ? 'astrologer' as const : 'customer' as const, text: (m.text as string) || '', at: m.createdAt, hook: m.hook as Hook | undefined }))
    : legacy.map((m) => ({ ...m, hook: undefined as Hook | undefined }));

  async function send() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      await callFn('sendRemedyThreadMessage', { remedyId: r.id, text: t, ...(hook ? { hook } : {}) });
      setText(''); setHook(null);
    } catch (e) {
      alert('Failed: ' + ((e as Error).message ?? String(e)));
    } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', cursor: collapsible ? 'pointer' : 'default' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {collapsible && <span className="muted" style={{ fontSize: 12, width: 12, flex: 'none' }}>{open ? '▾' : '▸'}</span>}
          <span className="badge purple" style={{ fontSize: 10 }}>AI</span>
          <strong style={{ fontSize: 14 }}>{astro}</strong>
          <span className="muted" style={{ fontSize: 12 }}>· 🪔 {title} · <Link href={`/users/${r.customerId}`} onClick={(e) => e.stopPropagation()}>{(r.customerId as string)?.slice(0, 10) ?? '—'}</Link></span>
        </div>
        {r.threadUnreadForPortal ? <span className="badge amber" style={{ fontSize: 10 }}>customer replied</span>
          : r.pendingPortal ? <span className="badge amber" style={{ fontSize: 10 }}>awaiting reply</span> : null}
      </div>
      {open && (
      <>
      {note ? <div className="muted" style={{ marginTop: 6, fontSize: 12, whiteSpace: 'pre-wrap' }}>{note}</div> : null}

      {/* The conversation */}
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {msgs.length === 0 ? <span className="muted" style={{ fontSize: 12.5 }}>No messages yet — start the conversation below.</span> : msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'astrologer' ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
            <div style={{ padding: '8px 11px', borderRadius: 12, fontSize: 13.5, whiteSpace: 'pre-wrap',
              background: m.role === 'astrologer' ? 'linear-gradient(135deg,#efe7ff,#fff6e2)' : '#f3f2f7',
              border: m.role === 'astrologer' ? '1px solid #e0d3f7' : '1px solid #eceaf2' }}>
              {m.text}
              {m.hook ? <div style={{ marginTop: 5, fontSize: 12, color: '#6a5acd' }}>🛍️ {m.hook.title} — “{m.hook.cta}”</div> : null}
            </div>
            <span className="muted" style={{ fontSize: 10.5 }}>{m.role === 'astrologer' ? astro : 'Customer'} · {fmt(m.at)}</span>
          </div>
        ))}
      </div>

      {/* Composer */}
      <textarea className="input" style={{ marginTop: 10, width: '100%', minHeight: 64, resize: 'vertical', fontSize: 13.5 }}
        placeholder={`Message the customer as ${astro} — warm, genuine, in their voice…`} maxLength={600}
        value={text} onChange={(e) => setText(e.target.value)} />
      <ProductHookPicker attached={hook} onAttach={setHook} onClear={() => setHook(null)} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <span className="muted" style={{ fontSize: 11.5 }}>{text.length}/600 · free message · reaches the customer as a notification</span>
        <button className="btn sm" disabled={busy || !text.trim()} onClick={send}>{busy ? 'Sending…' : 'Send message'}</button>
      </div>
      </>
      )}
    </div>
  );
}

export default function AiRemediesPage() {
  const pendingC = useMemo(() => [where('pendingPortal', '==', true)], []);
  const repliedC = useMemo(() => [where('threadUnreadForPortal', '==', true)], []);
  const historyC = useMemo(() => [where('pendingPortal', '==', false), limit(100)], []);
  const pending = useCollection('remedies', pendingC);
  const replied = useCollection('remedies', repliedC);
  const history = useCollection('remedies', historyC);

  // "Needs reply" = brand-new questions + threads where the customer just wrote back.
  const needsReply = useMemo(() => {
    const map = new Map<string, Row>();
    [...pending.rows, ...replied.rows].forEach((r) => map.set(r.id, r));
    return [...map.values()].sort((a, b) => msOf(a.threadLastAt ?? a.questionAt) - msOf(b.threadLastAt ?? b.questionAt));
  }, [pending.rows, replied.rows]);

  const conversations = useMemo(() => {
    const needsIds = new Set(needsReply.map((r) => r.id));
    return [...history.rows].filter((r) => !needsIds.has(r.id))
      .sort((a, b) => msOf(b.threadLastAt ?? b.answerAt) - msOf(a.threadLastAt ?? a.answerAt));
  }, [history.rows, needsReply]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>🪔 AI Remedy Conversations</h1>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Chat with customers on an AI astrologer’s remedy — answer questions, nurture the relationship, and suggest products. Free messages; the reply reaches them as a notification.
          </p>
        </div>
        <span className="udet-total">{needsReply.length}</span>
      </div>

      <h2 style={{ marginTop: 20, marginBottom: 0, fontSize: 18 }}>📥 Needs your reply</h2>
      {pending.loading ? <p className="muted" style={{ marginTop: 12 }}>Loading…</p>
        : needsReply.length === 0 ? (
          <div className="card" style={{ marginTop: 12 }}><p className="drawer-muted" style={{ margin: 0 }}>All caught up. 🌙</p></div>
        ) : needsReply.map((r) => <RemedyThread key={r.id} r={r} />)}

      <h2 style={{ marginTop: 28, marginBottom: 0, fontSize: 18 }}>💬 All conversations</h2>
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Everyone you’ve replied to — reopen any to send a follow-up or a product suggestion.</p>
      {history.loading ? <p className="muted" style={{ marginTop: 12 }}>Loading…</p>
        : conversations.length === 0 ? (
          <div className="card" style={{ marginTop: 12 }}><p className="drawer-muted" style={{ margin: 0 }}>No conversations yet.</p></div>
        ) : conversations.map((r) => <RemedyThread key={r.id} r={r} collapsible />)}
    </div>
  );
}
