'use client';

import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection } from '@/lib/hooks';
import { formatDate } from '@/lib/format';

export default function SupportPage() {
  const { rows, loading } = useCollection('supportTickets');

  async function setStatus(id: string, status: string) {
    await updateDoc(doc(db, 'supportTickets', id), { status, updatedAt: serverTimestamp() });
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
          <table>
            <thead>
              <tr><th>Subject</th><th>From</th><th>Created</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>{t.subject ?? '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {(t.customerId ?? t.astrologerId ?? '—').slice(0, 10)}
                  </td>
                  <td>{formatDate(t.createdAt?.toMillis?.())}</td>
                  <td><span className={`badge ${badge(t.status)}`}>{t.status ?? 'open'}</span></td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {t.status !== 'closed' && (
                      <button className="btn sm" onClick={() => setStatus(t.id, 'closed')}>Close</button>
                    )}
                    {t.status === 'open' && (
                      <button className="btn sm secondary" onClick={() => setStatus(t.id, 'assigned')}>Assign to me</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
