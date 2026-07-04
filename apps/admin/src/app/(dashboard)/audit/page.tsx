'use client';

import { useMemo, useState } from 'react';
import { orderBy, limit } from 'firebase/firestore';
import { useCollection } from '@/lib/hooks';
import { formatDate } from '@/lib/format';

const pretty = (a: string) => a.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
function actionColor(a: string): string {
  if (/reject|remove|delete|suspend|debit|blocked|disabled/.test(a)) return 'red';
  if (/approve|credit|create|processed|active/.test(a)) return 'green';
  if (/role|admin|status|reply|close|reopen/.test(a)) return 'purple';
  return 'amber';
}

export default function AuditPage() {
  const { rows, loading } = useCollection('auditLogs', [orderBy('createdAt', 'desc'), limit(300)]);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.action, r.actorName, r.actorUid, r.targetType, r.targetId].some((v) => String(v ?? '').toLowerCase().includes(s)),
    );
  }, [rows, q]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Audit Log</h1>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Every privileged action, who did it and when. Newest first.</p>
        </div>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search action, admin, target…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        {loading ? <p className="muted">Loading…</p> : filtered.length === 0 ? (
          <p className="muted">No audit entries{q ? ' match your search.' : ' yet.'}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th></tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                      {r.createdAt?.toMillis ? formatDate(r.createdAt.toMillis()) : '—'}
                    </td>
                    <td>
                      <b>{(r.actorName as string) || 'Admin'}</b>
                      <div className="muted" style={{ fontSize: 11, fontFamily: 'monospace' }}>{String(r.actorUid ?? '').slice(0, 10)}</div>
                    </td>
                    <td><span className={`badge ${actionColor(String(r.action ?? ''))}`}>{pretty(String(r.action ?? '—'))}</span></td>
                    <td className="muted" style={{ fontSize: 13 }}>
                      {r.targetType ? <span>{String(r.targetType)}</span> : null}
                      {r.targetId ? <span style={{ fontFamily: 'monospace', marginLeft: 6 }}>{String(r.targetId).slice(0, 12)}</span> : null}
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
