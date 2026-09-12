'use client';

import { useCollection, type Row } from '@/lib/hooks';
import { formatDate } from '@/lib/format';

/**
 * Read-only visibility for self-service account-deletion jobs
 * (`accountDeletions/{uid}`, written by deleteAccount → processAccountDeletion).
 * A healthy job flips 'pending' → 'done' within a minute or two. A job stuck in
 * 'pending' for a while means the background worker failed — this page surfaces
 * those so they don't stay invisible. No actions here (erasure is irreversible
 * and worker-driven); it's an observability window.
 */
const STUCK_AFTER_MS = 15 * 60 * 1000; // pending longer than this → flag as stuck

export default function AccountDeletionsPage() {
  const { rows, loading } = useCollection('accountDeletions');

  const now = Date.now();
  const isStuck = (r: Row) =>
    r.status === 'pending' && now - (r.requestedAt?.toMillis?.() ?? now) > STUCK_AFTER_MS;

  // Stuck jobs first, then newest by request time.
  const sorted = [...rows].sort((a, b) => {
    const s = Number(isStuck(b)) - Number(isStuck(a));
    if (s !== 0) return s;
    return (b.requestedAt?.toMillis?.() ?? 0) - (a.requestedAt?.toMillis?.() ?? 0);
  });
  const stuckCount = rows.filter(isStuck).length;

  return (
    <div>
      <h1>Account Deletions</h1>
      <div className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No account-deletion jobs.</p>
        ) : (
          <>
            {stuckCount > 0 && (
              <p style={{ color: 'var(--danger, #c0392b)', fontWeight: 600, marginTop: 0 }}>
                ⚠ {stuckCount} deletion job{stuckCount > 1 ? 's' : ''} stuck in “pending” — the background worker may have failed.
              </p>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table className="cardify">
                <thead>
                  <tr><th>User ID</th><th>Status</th><th>Requested</th><th>Completed</th></tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id}>
                      <td data-label="User ID" style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.uid ?? r.id}</td>
                      <td data-label="Status">
                        <span className={`badge ${r.status === 'done' ? 'green' : isStuck(r) ? 'red' : 'amber'}`}>
                          {isStuck(r) ? 'stuck' : (r.status ?? 'pending')}
                        </span>
                      </td>
                      <td data-label="Requested">{formatDate(r.requestedAt?.toMillis?.())}</td>
                      <td data-label="Completed">{r.completedAt?.toMillis?.() ? formatDate(r.completedAt.toMillis()) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
