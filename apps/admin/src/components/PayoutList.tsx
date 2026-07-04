'use client';

import { useEffect, useState } from 'react';
import { callFn } from '@/lib/hooks';
import { formatPaise, formatDate } from '@/lib/format';

export interface PayoutRow {
  id: string;
  astrologerName: string;
  amount: number; // paise
  method: string;
  status: string; // pending | approved | processed | rejected
  createdMs: number;
}

type Tab = 'pending' | 'paid' | 'all';
type Decision = 'approved' | 'processed' | 'rejected';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', approved: 'Approved', processed: 'Paid', rejected: 'Rejected',
};

/** Interactive payout list: approve, mark paid, or reject each request. */
export function PayoutList({ payouts }: { payouts: PayoutRow[] }) {
  const [rows, setRows] = useState<PayoutRow[]>(payouts);
  const [tab, setTab] = useState<Tab>('pending');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setRows(payouts), [payouts]);

  const match = (t: Tab, s: string) =>
    t === 'all' ? true : t === 'paid' ? s === 'processed' : s === 'pending' || s === 'approved';
  const shown = rows.filter((p) => match(tab, p.status));
  const counts = {
    pending: rows.filter((p) => p.status === 'pending' || p.status === 'approved').length,
    paid: rows.filter((p) => p.status === 'processed').length,
    all: rows.length,
  };

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

  return (
    <div className="tkt">
      <div className="tkt-tabs">
        {(['pending', 'paid', 'all'] as Tab[]).map((k) => (
          <button key={k} className={`tkt-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>
            {k[0].toUpperCase() + k.slice(1)} <span>{counts[k]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="drawer-muted">No {tab === 'all' ? '' : tab} payouts in this period.</p>
      ) : (
        <div className="tkt-list">
          {shown.map((p) => {
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
          })}
        </div>
      )}
    </div>
  );
}
