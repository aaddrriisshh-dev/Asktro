'use client';

import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection, callFn } from '@/lib/hooks';
import { formatDate } from '@/lib/format';

export default function SupportPage() {
  const { rows, loading } = useCollection('supportTickets');

  // Close MUST go through the callable (same as the dashboard card): it notifies
  // the ticket owner AND writes an audit-log entry. A direct updateDoc here would
  // silently close the ticket with no customer notification and no audit trail.
  async function closeTicket(id: string) {
    try {
      await callFn('closeSupportTicket', { ticketId: id });
    } catch (e) {
      alert(`Could not close the ticket: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // "Assign to me" is a low-stakes local status change (no owner notification
  // needed), so a direct write is fine.
  async function assign(id: string) {
    await updateDoc(doc(db, 'supportTickets', id), { status: 'assigned', updatedAt: serverTimestamp() });
  }

  const badge = (s: string) => (s === 'closed' ? 'green' : s === 'assigned' ? 'amber' : 'red');

  return (
    <div>
      <h1>Support</h1>
      <div className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No support tickets.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table className="cardify">
            <thead>
              <tr><th>Ticket #</th><th>Subject</th><th>From</th><th>Message</th><th>Created</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td data-label="Ticket #" style={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {t.ticketNo ?? `#${t.id.slice(0, 6).toUpperCase()}`}
                  </td>
                  <td data-label="Subject">{t.subject ?? '—'}</td>
                  <td data-label="From">{t.userName ?? (t.customerId ?? t.astrologerId ?? '—').slice(0, 10)}</td>
                  <td data-label="Message" className="muted" style={{ maxWidth: 320 }}>{t.message ?? t.body ?? '—'}</td>
                  <td data-label="Created">{formatDate(t.createdAt?.toMillis?.())}</td>
                  <td data-label="Status"><span className={`badge ${badge(t.status)}`}>{t.status ?? 'open'}</span></td>
                  <td data-label="" style={{ display: 'flex', gap: 6 }}>
                    {t.status !== 'closed' && (
                      <button className="btn sm" onClick={() => closeTicket(t.id)}>Close</button>
                    )}
                    {t.status === 'open' && (
                      <button className="btn sm secondary" onClick={() => assign(t.id)}>Assign to me</button>
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
