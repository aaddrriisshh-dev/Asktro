'use client';

import { orderBy, limit } from 'firebase/firestore';
import { useCollection } from '@/lib/hooks';
import { formatDate } from '@/lib/format';

export default function AuditPage() {
  const { rows, loading } = useCollection('auditLogs', [orderBy('createdAt', 'desc'), limit(200)]);

  return (
    <div>
      <h1>Audit Log</h1>
      <p className="muted">Immutable record of every privileged action.</p>
      <div className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No audit entries yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>{formatDate(a.createdAt?.toMillis?.())}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{(a.actorUid ?? '—').slice(0, 10)}</td>
                  <td><span className="badge">{a.action}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {a.targetType}/{(a.targetId ?? '').slice(0, 8)}
                  </td>
                  <td style={{ fontSize: 12 }} className="muted">
                    {a.after ? JSON.stringify(a.after) : '—'}
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
