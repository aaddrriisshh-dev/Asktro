'use client';

import { orderBy, limit } from 'firebase/firestore';
import { useCollection } from '@/lib/hooks';
import { formatPaise, formatDate } from '@/lib/format';

/**
 * Astrologer earnings ledger — the immutable double-entry trail (astrologerLedger
 * collection, written by wallet/ledger.ts): every earning (+), payout/commission
 * and refund reversal (−). This is what reconciles a payout dispute; the
 * astrologer's single `earnings` figure is just the running sum of these. Live,
 * latest 300. `amount` is signed paise.
 */
export default function EarningsLedgerPage() {
  const { rows, loading } = useCollection('astrologerLedger', [orderBy('createdAt', 'desc'), limit(300)]);

  return (
    <div>
      <h1>Earnings Ledger</h1>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Every astrologer earning, commission and reversal — the line-by-line trail behind each astrologer’s total earnings. Latest 300.
      </p>
      <div className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No ledger entries yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cardify">
              <thead>
                <tr><th>Astrologer</th><th>Kind</th><th>Amount</th><th>Note</th><th>When</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const amt = (r.amount as number) ?? 0;
                  return (
                    <tr key={r.id}>
                      <td data-label="Astrologer" style={{ fontFamily: 'monospace', fontSize: 12 }}>{(r.astrologerId as string)?.slice(0, 10) ?? '—'}</td>
                      <td data-label="Kind"><span className="badge">{(r.kind as string) ?? '—'}</span></td>
                      <td data-label="Amount" className="uat-amount" style={{ color: amt < 0 ? 'var(--danger, #c0392b)' : 'var(--good, #2f9c63)' }}>
                        {amt < 0 ? '−' : '+'}{formatPaise(Math.abs(amt))}
                      </td>
                      <td data-label="Note" className="muted">{(r.note as string) ?? '—'}</td>
                      <td data-label="When" className="muted">{formatDate(r.createdAt?.toMillis?.())}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
