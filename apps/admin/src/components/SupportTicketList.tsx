'use client';

import { useEffect, useState } from 'react';
import { callFn } from '@/lib/hooks';
import { formatDate } from '@/lib/format';

export interface TicketRow {
  id: string;
  ticketNo: string;
  subject: string;
  message: string;
  status: string;
  who: string; // display name / id
  role: 'customer' | 'astrologer';
  priority: string;
  createdMs: number;
  thread: { by: string; text: string; atMs: number }[];
}

type Tab = 'open' | 'closed' | 'all';

/** Interactive ticket list: read the message, reply, and close/reopen. */
export function SupportTicketList({ tickets }: { tickets: TicketRow[] }) {
  const [rows, setRows] = useState<TicketRow[]>(tickets);
  const [tab, setTab] = useState<Tab>('open');
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setRows(tickets), [tickets]);

  const shown = rows.filter((t) => (tab === 'all' ? true : t.status === tab));
  const counts = {
    open: rows.filter((t) => t.status === 'open').length,
    closed: rows.filter((t) => t.status === 'closed').length,
    all: rows.length,
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

  return (
    <div className="tkt">
      <div className="tkt-tabs">
        {(['open', 'closed', 'all'] as Tab[]).map((k) => (
          <button key={k} className={`tkt-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>
            {k[0].toUpperCase() + k.slice(1)} <span>{counts[k]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="drawer-muted">No {tab === 'all' ? '' : tab} tickets in this period.</p>
      ) : (
        <div className="tkt-list">
          {shown.map((t) => {
            const isOpen = openId === t.id;
            return (
              <div key={t.id} className={`tkt-item${isOpen ? ' expanded' : ''}`}>
                <button className="tkt-head" onClick={() => { setOpenId(isOpen ? null : t.id); setDraft(''); }}>
                  <div className="tkt-head-main">
                    <span className="tkt-no">{t.ticketNo}</span>
                    <span className="tkt-subject">{t.subject}</span>
                  </div>
                  <div className="tkt-head-meta">
                    <span className={`tkt-badge ${t.status}`}>{t.status}</span>
                    <span className="tkt-caret">{isOpen ? '▴' : '▾'}</span>
                  </div>
                </button>

                {isOpen && (
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
                      <div key={i} className={`tkt-msg reply`}>
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
          })}
        </div>
      )}
    </div>
  );
}
