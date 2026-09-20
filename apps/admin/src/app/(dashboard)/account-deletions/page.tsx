'use client';

import { useState } from 'react';
import { useCollection, type Row } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import { DateFilter } from '@/components/DateFilter';
import { Preset, resolveRange } from '@/lib/dateRange';

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
  const [preset, setPreset] = useState<Preset>('allTime');
  const [custom, setCustom] = useState<{ start?: string; end?: string }>({});
  const range = resolveRange(preset, custom);

  const { rows, loading } = useCollection('accountDeletions');

  const now = Date.now();
  const isStuck = (r: Row) =>
    r.status === 'pending' && now - (r.requestedAt?.toMillis?.() ?? now) > STUCK_AFTER_MS;

  // Filter to the selected date range (by request time), then stuck jobs first,
  // then newest by request time.
  const inRange = rows.filter((r) => {
    const ms = r.requestedAt?.toMillis?.() ?? 0;
    return ms >= range.start && ms < range.end;
  });
  const sorted = [...inRange].sort((a, b) => {
    const s = Number(isStuck(b)) - Number(isStuck(a));
    if (s !== 0) return s;
    return (b.requestedAt?.toMillis?.() ?? 0) - (a.requestedAt?.toMillis?.() ?? 0);
  });
  const doneCount = inRange.filter((r) => r.status === 'done').length;
  const pendingCount = inRange.filter((r) => r.status !== 'done').length;
  const stuckCount = inRange.filter(isStuck).length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Account Deletions</h1>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Self-service deletion jobs. A healthy job flips &ldquo;pending&rdquo; → &ldquo;done&rdquo; in a minute or two; one stuck in &ldquo;pending&rdquo; means the worker may have failed.
          </p>
        </div>
        <DateFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} />
      </div>
      <div className="metricgrid" style={{ margin: '4px 0 14px' }}>
        <div className="aview-stat"><div className="k">🗑 Requests</div><div className="v">{inRange.length.toLocaleString('en-IN')}</div></div>
        <div className="aview-stat"><div className="k">✅ Done</div><div className="v">{doneCount.toLocaleString('en-IN')}</div></div>
        <div className="aview-stat"><div className="k">⏳ Pending</div><div className="v">{pendingCount.toLocaleString('en-IN')}</div></div>
        <div className="aview-stat"><div className="k">⚠ Stuck</div><div className="v">{stuckCount.toLocaleString('en-IN')}</div></div>
      </div>
      <div className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : inRange.length === 0 ? (
          <p className="muted">No account-deletion jobs in {range.label.toLowerCase()}.</p>
        ) : (
          <>
            {stuckCount > 0 && (
              <p style={{ color: 'var(--danger, #c0392b)', fontWeight: 600, marginTop: 0 }}>
                ⚠ {stuckCount} deletion job{stuckCount > 1 ? 's' : ''} stuck in &ldquo;pending&rdquo; — the background worker may have failed.
              </p>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table className="cardify">
                <thead>
                  <tr><th>Customer</th><th>Reason</th><th>Status</th><th>Requested</th><th>Completed</th></tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Customer">
                        <b>{(r.name as string) || 'Unknown'}</b>
                        <span className="muted" style={{ display: 'block', fontSize: 11 }}>{(r.phone as string) || (r.uid ?? r.id)}</span>
                      </td>
                      <td data-label="Reason" className="muted" style={{ fontSize: 13 }}>{(r.reason as string) || '—'}</td>
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
