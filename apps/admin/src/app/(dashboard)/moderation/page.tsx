'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { where, orderBy, limit } from 'firebase/firestore';
import { useCollection, callFn, Row } from '@/lib/hooks';

const fmt = (t: unknown) => {
  const ms = (t as { toMillis?: () => number })?.toMillis?.();
  return ms ? new Date(ms).toLocaleString('en-IN') : '—';
};
const msOf = (t: unknown) => (t as { toMillis?: () => number })?.toMillis?.() ?? 0;
const byNewest = (a: Row, b: Row) => msOf(b.createdAt) - msOf(a.createdAt);
const sevColor = (s: string) => (s === 'critical' ? '#d9534f' : s === 'warning' ? '#c9821a' : '#6b7280');

function ResolveBtn({ collection, id }: { collection: string; id: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <span className="muted" style={{ fontSize: 12 }}>✓ resolved</span>;
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await callFn('resolveOpsItem', { collection, id });
          setDone(true);
        } catch (e) {
          alert('Failed: ' + ((e as Error).message ?? String(e)));
        } finally {
          setBusy(false);
        }
      }}
      style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid var(--gold, #b8860b)', background: 'transparent', color: 'var(--gold-deep, #8a6d0b)', fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontSize: 12.5 }}
    >
      {busy ? '…' : 'Resolve'}
    </button>
  );
}

function SectionCard({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span className="udet-total">{count}</span>
      </div>
      {children}
    </div>
  );
}

export default function ModerationPage() {
  const reportsC = useMemo(() => [where('status', '==', 'open')], []);
  const alertsC = useMemo(() => [where('resolved', '==', false)], []);
  const dlC = useMemo(() => [where('resolved', '==', false)], []);
  const imgC = useMemo(() => [orderBy('createdAt', 'desc'), limit(50)], []);

  const reports = useCollection('reports', reportsC);
  const alerts = useCollection('alerts', alertsC);
  const deadletters = useCollection('failedWebhookCredits', dlC);
  const images = useCollection('imageModeration', imgC);

  const reportRows = [...reports.rows].sort(byNewest);
  const alertRows = [...alerts.rows].sort(byNewest);
  const dlRows = [...deadletters.rows].sort(byNewest);

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>🛡️ Trust &amp; Safety</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        User reports, content flags, payment failures, and operational alerts — resolve each as you action it.
      </p>

      {/* 1. Open user reports */}
      <SectionCard title="🚩 Open user reports" count={reportRows.length}>
        {reports.loading ? <p className="muted">Loading…</p>
          : reportRows.length === 0 ? <p className="drawer-muted">No open reports right now.</p>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Reporter</th><th>Reported</th><th>Reason</th><th>Details</th><th>When</th><th></th></tr></thead>
                  <tbody>
                    {reportRows.map((r) => (
                      <tr key={r.id}>
                        <td><Link href={`/users/${r.reporterId}`}>{(r.reporterId as string)?.slice(0, 10) ?? '—'}</Link></td>
                        <td><Link href={`/users/${r.reportedId}`} style={{ fontWeight: 600 }}>{(r.reportedId as string)?.slice(0, 10) ?? '—'}</Link></td>
                        <td><span className="badge">{(r.reason as string) ?? 'other'}</span></td>
                        <td className="muted" style={{ maxWidth: 280 }}>{(r.detail as string) || '—'}</td>
                        <td className="muted">{fmt(r.createdAt)}</td>
                        <td><ResolveBtn collection="reports" id={r.id} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </SectionCard>

      {/* 2. Operational alerts (failed payments, flagged messages, refund shortfalls, NSFW removals) */}
      <SectionCard title="🔔 Operational alerts" count={alertRows.length}>
        {alerts.loading ? <p className="muted">Loading…</p>
          : alertRows.length === 0 ? <p className="drawer-muted">No open alerts. All clear.</p>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Severity</th><th>Type</th><th>Message</th><th>When</th><th></th></tr></thead>
                  <tbody>
                    {alertRows.map((a) => (
                      <tr key={a.id}>
                        <td><span style={{ color: sevColor(a.severity as string), fontWeight: 700, fontSize: 12 }}>{(a.severity as string) ?? 'info'}</span></td>
                        <td className="muted">{(a.kind as string) ?? '—'}</td>
                        <td style={{ maxWidth: 420 }}>{(a.message as string) ?? '—'}</td>
                        <td className="muted">{fmt(a.createdAt)}</td>
                        <td><ResolveBtn collection="alerts" id={a.id} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </SectionCard>

      {/* 3. Payment dead-letters (webhook credits that failed and are being retried) */}
      <SectionCard title="💳 Payment failures (auto-retrying)" count={dlRows.length}>
        {deadletters.loading ? <p className="muted">Loading…</p>
          : dlRows.length === 0 ? <p className="drawer-muted">No unresolved payment failures.</p>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>User</th><th>Payment</th><th>Order</th><th>Attempts</th><th>Last error</th><th>When</th><th></th></tr></thead>
                  <tbody>
                    {dlRows.map((d) => (
                      <tr key={d.id}>
                        <td><Link href={`/users/${d.userId}`}>{(d.userId as string)?.slice(0, 10) ?? '—'}</Link></td>
                        <td className="muted">{(d.paymentId as string)?.slice(0, 16) ?? '—'}</td>
                        <td className="muted">{(d.orderId as string)?.slice(0, 16) ?? '—'}</td>
                        <td><b>{(d.attempts as number) ?? 0}</b></td>
                        <td className="muted" style={{ maxWidth: 260 }}>{(d.lastError as string) ?? '—'}</td>
                        <td className="muted">{fmt(d.createdAt)}</td>
                        <td><ResolveBtn collection="failedWebhookCredits" id={d.id} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </SectionCard>

      {/* 4. Chat image review queue */}
      <SectionCard title="🖼️ Chat image review queue" count={images.rows.length}>
        {images.loading ? <p className="muted">Loading…</p>
          : images.rows.length === 0 ? <p className="drawer-muted">No images queued. (Auto-scan enables via config.featureFlags.imageModeration.)</p>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Status</th><th>Consultation</th><th>Path</th><th>When</th><th></th></tr></thead>
                  <tbody>
                    {images.rows.map((im) => (
                      <tr key={im.id}>
                        <td><span className="badge">{(im.status as string) ?? 'pending'}</span></td>
                        <td className="muted">{(im.consultationId as string)?.slice(0, 12) ?? '—'}</td>
                        <td className="muted" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{(im.path as string) ?? '—'}</td>
                        <td className="muted">{fmt(im.createdAt)}</td>
                        <td><ResolveBtn collection="imageModeration" id={im.id} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </SectionCard>
    </div>
  );
}
