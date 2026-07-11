'use client';

import { useCollection, callFn } from '@/lib/hooks';
import { formatPaise, formatDate } from '@/lib/format';

export default function PayoutsPage() {
  const { rows, loading } = useCollection('payouts');

  async function decide(id: string, decision: 'approved' | 'rejected' | 'processed') {
    try {
      await callFn('processPayout', { payoutId: id, decision });
    } catch (e) {
      alert('Failed: ' + (e as Error).message);
    }
  }

  const badge = (s: string) => (s === 'processed' ? 'green' : s === 'rejected' ? 'red' : 'amber');

  return (
    <div>
      <h1>Payouts</h1>
      <div className="card">
        {loading ? <p className="muted">Loading…</p> : rows.length === 0 ? (
          <p className="muted">No payout requests.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Astrologer</th><th>Amount</th><th>Method</th><th>Requested</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.astrologerId?.slice(0, 10)}</td>
                  <td>{formatPaise(p.amount)}</td>
                  <td>{p.method ?? '—'}</td>
                  <td>{formatDate(p.createdAt?.toMillis?.())}</td>
                  <td><span className={`badge ${badge(p.status)}`}>{p.status}</span></td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {p.status === 'pending' && (
                      <>
                        <button className="btn sm" onClick={() => decide(p.id, 'approved')}>Approve</button>
                        <button className="btn sm danger" onClick={() => decide(p.id, 'rejected')}>Reject</button>
                      </>
                    )}
                    {p.status === 'approved' && (
                      <button className="btn sm" onClick={() => decide(p.id, 'processed')}>Mark paid</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
