'use client';

import { useEffect, useState } from 'react';
import { callFn } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import { Metric } from './Metric';

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
  { key: 'customer', label: 'User Tickets', icon: '👤', color: 'c-blue' },
  { key: 'astrologer', label: 'Astrologer Tickets', icon: '🔮', color: 'c-purple' },
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => setRows(tickets), [tickets]);

  const counts = {
    open: rows.filter((t) => t.status === 'open').length,
    closed: rows.filter((t) => t.status === 'closed').length,
    total: rows.length,
    high: rows.filter((t) => t.priority === 'high').length,
  };

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

  return (
    <div className="tkt">
      <div className="metricgrid">
        <Metric color="c-red" label="Open" value={counts.open.toLocaleString('en-IN')} big />
        <Metric color="c-green" label="Closed" value={counts.closed.toLocaleString('en-IN')} big />
        <Metric color="c-blue" label="Total" value={counts.total.toLocaleString('en-IN')} />
        <Metric color="c-rose" label="High priority" value={counts.high.toLocaleString('en-IN')} />
      </div>

      {GROUPS.map((g) => {
        const groupRows = rows
          .filter((r) => r.role === g.key)
          .sort((a, b) => (a.status === b.status ? b.createdMs - a.createdMs : a.status === 'open' ? -1 : 1));
        const openN = groupRows.filter((r) => r.status === 'open').length;
        const closedN = groupRows.filter((r) => r.status === 'closed').length;
        const isOpen = !!expanded[g.key];
        return (
          <div className="tktcat-wrap" key={g.key}>
            <button className={`tktcat ${g.color}`} onClick={() => setExpanded((s) => ({ ...s, [g.key]: !s[g.key] }))}>
              <span className="tktcat-ico">{g.icon}</span>
              <span className="tktcat-main">
                <strong>{g.label}</strong>
                <em>{openN} open · {closedN} closed</em>
              </span>
              <span className="tktcat-count">{groupRows.length}</span>
              <span className="tkt-caret">{isOpen ? '▴' : '▾'}</span>
            </button>
            {isOpen && (
              groupRows.length === 0
                ? <p className="drawer-muted">No tickets yet.</p>
                : <div className="tkt-list tktcat-list">{groupRows.map(renderTicket)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
