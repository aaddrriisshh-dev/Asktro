'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { callFn } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import { Metric } from './Metric';

const expandIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);

export interface TicketRow {
  id: string;
  ticketNo: string;
  subject: string;
  message: string;
  status: string;
  who: string;
  role: 'customer' | 'astrologer';
  priority: string;
  createdMs: number;
  thread: { by: string; text: string; atMs: number }[];
}

const GROUPS = [
  { key: 'customer', label: 'User Tickets', icon: '👤', color: 'c-purple' },
  { key: 'astrologer', label: 'Astrologer Tickets', icon: '🔮', color: 'c-amber' },
] as const;

/**
 * Support console: live summary chips + two clickable category cards
 * (User / Astrologer). Each card expands in place to show that group's
 * tickets, where the admin can read the message, reply and close/reopen.
 */
export function SupportTicketList({ tickets }: { tickets: TicketRow[] }) {
  const [rows, setRows] = useState<TicketRow[]>(tickets);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [active, setActive] = useState<'customer' | 'astrologer' | null>(null);

  useEffect(() => setRows(tickets), [tickets]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setActive(null); }
    if (active) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  const counts = {
    open: rows.filter((t) => t.status === 'open').length,
    closed: rows.filter((t) => t.status === 'closed').length,
    total: rows.length,
    high: rows.filter((t) => t.priority === 'high').length,
  };
  const byRole = (role: string) => rows.filter((r) => r.role === role);

  async function sendReply(t: TicketRow) {
    if (!draft.trim()) return;
    setBusy(t.id);
    try {
      await callFn('replySupportTicket', { ticketId: t.id, text: draft.trim() });
      setRows((rs) => rs.map((r) => r.id === t.id
        ? { ...r, status: 'open', thread: [...r.thread, { by: 'admin', text: draft.trim(), atMs: Date.now() }] }
        : r));
      setDraft('');
    } catch (e) {
      alert('Could not send reply: ' + (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(t: TicketRow, close: boolean) {
    setBusy(t.id);
    try {
      await callFn(close ? 'closeSupportTicket' : 'reopenSupportTicket', { ticketId: t.id });
      setRows((rs) => rs.map((r) => (r.id === t.id ? { ...r, status: close ? 'closed' : 'open' } : r)));
    } catch (e) {
      alert('Could not update ticket: ' + (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function renderTicket(t: TicketRow) {
    const isExpanded = openId === t.id;
    return (
      <div key={t.id} className={`tkt-item${isExpanded ? ' expanded' : ''}`}>
        <button className="tkt-head" onClick={() => { setOpenId(isExpanded ? null : t.id); setDraft(''); }}>
          <div className="tkt-head-main">
            <span className="tkt-no">{t.ticketNo}</span>
            <span className="tkt-subject">{t.subject}</span>
          </div>
          <div className="tkt-head-meta">
            <span className={`tkt-badge ${t.status}`}>{t.status}</span>
            <span className="tkt-caret">{isExpanded ? '▴' : '▾'}</span>
          </div>
        </button>
        {isExpanded && (
          <div className="tkt-body">
            <div className="tkt-meta-line">
              <span>{t.role === 'astrologer' ? '🔮' : '👤'} {t.who}</span>
              <span>{formatDate(t.createdMs)}</span>
              {t.priority && <span className={`tkt-pri ${t.priority}`}>{t.priority}</span>}
            </div>
            <div className="tkt-msg">
              <span className="tkt-msg-from">Message</span>
              <p>{t.message || '(no message provided)'}</p>
            </div>
            {t.thread.map((m, i) => (
              <div key={i} className="tkt-msg reply">
                <span className="tkt-msg-from">{m.by === 'admin' ? 'You (admin)' : m.by}</span>
                <p>{m.text}</p>
              </div>
            ))}
            <textarea
              className="tkt-reply"
              placeholder="Type a reply to the user…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="tkt-actions">
              <button className="btn sm" disabled={busy === t.id || !draft.trim()} onClick={() => sendReply(t)}>
                {busy === t.id ? 'Sending…' : 'Send reply'}
              </button>
              {t.status === 'closed' ? (
                <button className="btn sm secondary" disabled={busy === t.id} onClick={() => setStatus(t, false)}>Reopen</button>
              ) : (
                <button className="btn sm danger" disabled={busy === t.id} onClick={() => setStatus(t, true)}>Close ticket</button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  const activeGroup = GROUPS.find((g) => g.key === active);
  const activeRows = active
    ? byRole(active).sort((a, b) => (a.status === b.status ? b.createdMs - a.createdMs : a.status === 'open' ? -1 : 1))
    : [];

  return (
    <div className="tkt">
      <div className="metricgrid">
        <Metric color="c-red" label="Open" value={counts.open.toLocaleString('en-IN')} big />
        <Metric color="c-green" label="Closed" value={counts.closed.toLocaleString('en-IN')} big />
        <Metric color="c-blue" label="Total" value={counts.total.toLocaleString('en-IN')} />
        {GROUPS.map((g) => (
          <button
            key={g.key}
            className={`metricchip ${g.color} metricchip--btn`}
            onClick={() => setActive(g.key)}
          >
            <span className="mc-go">{expandIcon}</span>
            <span>{g.label}</span>
            <strong>{byRole(g.key).length.toLocaleString('en-IN')}</strong>
            <span className="mc-hint">Tap to open</span>
          </button>
        ))}
        <Metric color="c-rose" label="High priority" value={counts.high.toLocaleString('en-IN')} />
      </div>

      {activeGroup && createPortal(
        <div className="tktmodal-root" role="dialog" aria-modal="true" onClick={() => setActive(null)}>
          <div className={`tktmodal ${activeGroup.color}`} onClick={(e) => e.stopPropagation()}>
            <div className="tktmodal-head">
              <div>
                <h3>{activeGroup.icon} {activeGroup.label}</h3>
                <p>{activeRows.filter((r) => r.status === 'open').length} open · {activeRows.filter((r) => r.status === 'closed').length} closed</p>
              </div>
              <button className="tktmodal-close" onClick={() => setActive(null)} aria-label="Close">×</button>
            </div>
            <div className="tktmodal-body">
              {activeRows.length === 0
                ? <p className="drawer-muted">No tickets yet.</p>
                : <div className="tkt-list">{activeRows.map(renderTicket)}</div>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
