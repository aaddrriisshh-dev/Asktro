'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { callFn } from '@/lib/hooks';
import { formatPaise, formatDate } from '@/lib/format';
import { Metric } from './Metric';

export interface PayoutRow {
  id: string;
  astrologerName: string;
  amount: number; // paise
  method: string;
  status: string; // pending | approved | processed | rejected
  createdMs: number;
}

type Decision = 'approved' | 'processed' | 'rejected';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', approved: 'Approved', processed: 'Paid', rejected: 'Rejected',
};

// The two clickable buckets, mirroring the Support panel's category cards.
const GROUPS = [
  { key: 'pending', label: 'Pending Payouts', color: 'c-bronze', match: (s: string) => s === 'pending' || s === 'approved' },
  { key: 'paid', label: 'Paid Payouts', color: 'c-green', match: (s: string) => s === 'processed' || s === 'rejected' },
] as const;

const eyeIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/** Payout console: live money summary + clickable Pending / Paid cards that open a popup. */
export function PayoutList({ payouts }: { payouts: PayoutRow[] }) {
  const [rows, setRows] = useState<PayoutRow[]>(payouts);
  const [busy, setBusy] = useState<string | null>(null);
  const [active, setActive] = useState<'pending' | 'paid' | null>(null);

  useEffect(() => setRows(payouts), [payouts]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setActive(null); }
    if (active) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  const sum = (pred: (r: PayoutRow) => boolean) => rows.filter(pred).reduce((n, r) => n + r.amount, 0);
  const pendingAmt = sum((r) => r.status === 'pending' || r.status === 'approved');
  const paidAmt = sum((r) => r.status === 'processed');
  const totalAmt = sum(() => true);
  const avg = rows.length ? Math.round(totalAmt / rows.length) : 0;

  async function decide(p: PayoutRow, decision: Decision) {
    setBusy(p.id);
    try {
      await callFn('processPayout', { payoutId: p.id, decision });
      setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, status: decision } : r)));
    } catch (e) {
      alert('Could not update payout: ' + (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function renderRow(p: PayoutRow) {
    const terminal = p.status === 'processed' || p.status === 'rejected';
    return (
      <div key={p.id} className="pay-item">
        <div className="pay-row">
          <div className="pay-main">
            <span className="pay-name">{p.astrologerName}</span>
            <span className="pay-sub">{p.method} · {formatDate(p.createdMs)}</span>
          </div>
          <div className="pay-right">
            <span className="pay-amount">{formatPaise(p.amount)}</span>
            <span className={`tkt-badge pay-${p.status}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
          </div>
        </div>
        {!terminal && (
          <div className="tkt-actions">
            {p.status === 'pending' && (
              <button className="btn sm secondary" disabled={busy === p.id} onClick={() => decide(p, 'approved')}>Approve</button>
            )}
            <button className="btn sm" disabled={busy === p.id} onClick={() => decide(p, 'processed')}>
              {busy === p.id ? 'Saving…' : 'Mark paid'}
            </button>
            <button className="btn sm danger" disabled={busy === p.id} onClick={() => decide(p, 'rejected')}>Reject</button>
          </div>
        )}
      </div>
    );
  }

  const activeGroup = GROUPS.find((g) => g.key === active);
  const activeRows = activeGroup
    ? rows.filter((r) => activeGroup.match(r.status)).sort((a, b) => b.createdMs - a.createdMs)
    : [];

  return (
    <div className="tkt">
      <div className="metricgrid">
        <Metric color="c-bronze" label="Pending payout" value={formatPaise(pendingAmt)} big />
        <Metric color="c-green" label="Paid out" value={formatPaise(paidAmt)} big />
        <Metric color="c-blue" label="Total requested" value={formatPaise(totalAmt)} />
        <Metric color="c-gold" label="Avg payout" value={formatPaise(avg)} />
        {GROUPS.map((g) => (
          <button
            key={g.key}
            className={`metricchip ${g.color} metricchip--btn`}
            onClick={() => setActive(g.key)}
          >
            <span className="mc-go">{eyeIcon}</span>
            <span>{g.label}</span>
            <strong>{rows.filter((r) => g.match(r.status)).length.toLocaleString('en-IN')}</strong>
            <span className="mc-hint">Tap to open</span>
          </button>
        ))}
      </div>

      {activeGroup && createPortal(
        <div className="tktmodal-root" role="dialog" aria-modal="true" onClick={() => setActive(null)}>
          <div className={`tktmodal ${activeGroup.color}`} onClick={(e) => e.stopPropagation()}>
            <div className="tktmodal-head">
              <div>
                <h3>{activeGroup.label}</h3>
                <p>{activeRows.length} request{activeRows.length === 1 ? '' : 's'} · {formatPaise(activeRows.reduce((n, r) => n + r.amount, 0))}</p>
              </div>
              <button className="tktmodal-close" onClick={() => setActive(null)} aria-label="Close">×</button>
            </div>
            <div className="tktmodal-body">
              {activeRows.length === 0
                ? <p className="drawer-muted">No payouts here yet.</p>
                : <div className="tkt-list">{activeRows.map(renderRow)}</div>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
