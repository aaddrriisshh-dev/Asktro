'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { where, orderBy, limit, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection, useNamesByIds, callFn, Row } from '@/lib/hooks';

const fmt = (t: unknown) => {
  const ms = (t as { toMillis?: () => number })?.toMillis?.();
  return ms ? new Date(ms).toLocaleString('en-IN') : '—';
};
const msOf = (t: unknown) => (t as { toMillis?: () => number })?.toMillis?.() ?? 0;
const byNewest = (a: Row, b: Row) => msOf(b.createdAt) - msOf(a.createdAt);
const sevColor = (s: string) => (s === 'critical' ? '#d9534f' : s === 'warning' ? '#c9821a' : '#6b7280');

/** Render any Firestore value readably (timestamps → date, objects → JSON). */
function renderVal(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') {
    const t = (v as { toMillis?: () => number }).toMillis;
    if (typeof t === 'function') return new Date(t.call(v)).toLocaleString('en-IN');
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

/** Full detail of an item — every captured field, so the reason is always visible.
 *  `labels` renames/reorders the important keys; anything else still shows below. */
function Detail({ r, labels }: { r: Row; labels?: Record<string, string> }) {
  const skip = new Set(['id']);
  const primary = labels ? Object.keys(labels) : [];
  const rest = Object.keys(r).filter((k) => !skip.has(k) && !primary.includes(k)).sort();
  const rowFor = (k: string, label: string) => (
    <div key={k} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, padding: '3px 0' }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <span style={{ fontSize: 12.5, wordBreak: 'break-word' }}>{renderVal(r[k])}</span>
    </div>
  );
  return (
    <div style={{ background: 'rgba(107,75,192,.04)', border: '1px solid var(--line, #eee)', borderRadius: 10, padding: '10px 12px', margin: '2px 0 6px' }}>
      {primary.map((k) => rowFor(k, labels![k]))}
      {rest.map((k) => rowFor(k, k))}
    </div>
  );
}

/** A clickable summary row that expands to a full-width detail panel with a
 *  Resolve action inside — so nothing is ever dismissed without reading it. */
function OpsRow({
  cols, cells, detail, collection, id,
}: {
  cols: number;
  cells: React.ReactNode;
  detail: React.ReactNode;
  collection: string;
  id: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const resolve = async () => {
    setBusy(true);
    try { await callFn('resolveOpsItem', { collection, id }); setDone(true); }
    catch (e) { alert('Failed: ' + ((e as Error).message ?? String(e))); }
    finally { setBusy(false); }
  };
  return (
    <>
      <tr onClick={() => setOpen((o) => !o)} style={{ cursor: 'pointer' }}>
        <td data-label="" style={{ width: 20, color: 'var(--muted)' }}>{open ? '▾' : '▸'}</td>
        {cells}
        <td data-label="" onClick={(e) => e.stopPropagation()}>
          {done ? <span className="muted" style={{ fontSize: 12 }}>✓ resolved</span>
            : <button className="btn sm secondary" disabled={busy} onClick={() => setOpen(true)}>View</button>}
        </td>
      </tr>
      {open && !done && (
        <tr>
          <td colSpan={cols} style={{ background: 'transparent' }}>
            {detail}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button
                disabled={busy}
                onClick={resolve}
                style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid var(--gold, #b8860b)', background: 'transparent', color: 'var(--gold-deep, #8a6d0b)', fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontSize: 12.5 }}
              >
                {busy ? '…' : '✓ Mark resolved'}
              </button>
              <button className="btn sm secondary" onClick={() => setOpen(false)}>Close</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SectionCard({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span className="udet-total">{count}</span>
      </div>
      <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>Tap a row to see the full details, then resolve.</p>
      {children}
    </div>
  );
}

/** Super-admin toggle for config/global.featureFlags.imageModeration. */
function ImageScanToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => onSnapshot(doc(db, 'config', 'global'), (s) => {
    const ff = (s.data()?.featureFlags ?? {}) as { imageModeration?: boolean };
    setEnabled(ff.imageModeration === true);
  }), []);
  const on = enabled === true;
  const toggle = async () => {
    setBusy(true);
    try {
      await setDoc(doc(db, 'config', 'global'), { featureFlags: { imageModeration: !on } }, { merge: true });
    } catch (e) {
      alert('Failed (Super Admin only): ' + ((e as Error).message ?? String(e)));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
      <button
        onClick={toggle}
        disabled={busy || enabled === null}
        style={{
          padding: '6px 14px', borderRadius: 20, border: 'none', fontWeight: 700, fontSize: 12.5,
          cursor: busy || enabled === null ? 'default' : 'pointer',
          background: on ? '#2f9c63' : '#c9ccd6', color: '#fff',
        }}
      >
        {enabled === null ? '…' : on ? '● Auto-scan ON' : '○ Auto-scan OFF'}
      </button>
      <span className="muted" style={{ fontSize: 12 }}>
        {on
          ? 'New chat images are auto-scanned (Cloud Vision) and unsafe ones removed + flagged. Needs the Vision API enabled on the project.'
          : 'Off — every chat image is queued below for manual review. Turn on once the Cloud Vision API is enabled.'}
      </span>
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

  // Resolve UIDs → names. "Reported" can be an astrologer/persona OR a customer.
  const reporterNames = useNamesByIds('users', reportRows.map((r) => String(r.reporterId ?? '')));
  const reportedAstro = useNamesByIds('astrologers', reportRows.map((r) => String(r.reportedId ?? '')));
  const reportedUser = useNamesByIds('users', reportRows.map((r) => String(r.reportedId ?? '')));
  const dlUserNames = useNamesByIds('users', dlRows.map((d) => String(d.userId ?? '')));
  const nameOf = (map: Map<string, string>, id: unknown) => {
    const s = String(id ?? '');
    return map.get(s) || (s ? s.slice(0, 10) : '—');
  };
  const reportedName = (id: unknown) => {
    const s = String(id ?? '');
    return reportedAstro.get(s) || reportedUser.get(s) || (s ? s.slice(0, 14) : '—');
  };

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>🛡️ Trust &amp; Safety</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        User reports, content flags, payment failures, and operational alerts — tap any row to read the full details, then resolve.
      </p>

      {/* 1. Open user reports */}
      <SectionCard title="🚩 Open user reports" count={reportRows.length}>
        {reports.loading ? <p className="muted">Loading…</p>
          : reportRows.length === 0 ? <p className="drawer-muted">No open reports right now.</p>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table className="cardify">
                  <thead><tr><th></th><th>Reporter</th><th>Reported</th><th>Reason</th><th>When</th><th></th></tr></thead>
                  <tbody>
                    {reportRows.map((r) => (
                      <OpsRow key={r.id} collection="reports" id={r.id} cols={6}
                        cells={<>
                          <td data-label="Reporter"><Link href={`/users/${r.reporterId}`} onClick={(e) => e.stopPropagation()}>{nameOf(reporterNames, r.reporterId)}</Link></td>
                          <td data-label="Reported" style={{ fontWeight: 600 }}>{reportedName(r.reportedId)}</td>
                          <td data-label="Reason"><span className="badge">{(r.reason as string) ?? 'other'}</span></td>
                          <td data-label="When" className="muted">{fmt(r.createdAt)}</td>
                        </>}
                        detail={<Detail r={r} labels={{ reason: 'Reason', detail: 'Details (customer note)' }} />}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </SectionCard>

      {/* 2. Operational alerts */}
      <SectionCard title="🔔 Operational alerts" count={alertRows.length}>
        {alerts.loading ? <p className="muted">Loading…</p>
          : alertRows.length === 0 ? <p className="drawer-muted">No open alerts. All clear.</p>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table className="cardify">
                  <thead><tr><th></th><th>Severity</th><th>Type</th><th>Message</th><th>When</th><th></th></tr></thead>
                  <tbody>
                    {alertRows.map((a) => (
                      <OpsRow key={a.id} collection="alerts" id={a.id} cols={6}
                        cells={<>
                          <td data-label="Severity"><span style={{ color: sevColor(a.severity as string), fontWeight: 700, fontSize: 12 }}>{(a.severity as string) ?? 'info'}</span></td>
                          <td data-label="Type" className="muted">{(a.kind as string) ?? '—'}</td>
                          <td data-label="Message" style={{ maxWidth: 420 }}>{(a.message as string) ?? '—'}</td>
                          <td data-label="When" className="muted">{fmt(a.createdAt)}</td>
                        </>}
                        detail={<Detail r={a} labels={{ severity: 'Severity', kind: 'Type', message: 'What happened' }} />}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </SectionCard>

      {/* 3. Payment dead-letters */}
      <SectionCard title="💳 Payment failures (auto-retrying)" count={dlRows.length}>
        {deadletters.loading ? <p className="muted">Loading…</p>
          : dlRows.length === 0 ? <p className="drawer-muted">No unresolved payment failures.</p>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table className="cardify">
                  <thead><tr><th></th><th>User</th><th>Attempts</th><th>Last error</th><th>When</th><th></th></tr></thead>
                  <tbody>
                    {dlRows.map((d) => (
                      <OpsRow key={d.id} collection="failedWebhookCredits" id={d.id} cols={6}
                        cells={<>
                          <td data-label="User"><Link href={`/users/${d.userId}`} onClick={(e) => e.stopPropagation()}>{nameOf(dlUserNames, d.userId)}</Link></td>
                          <td data-label="Attempts"><b>{(d.attempts as number) ?? 0}</b></td>
                          <td data-label="Last error" className="muted" style={{ maxWidth: 260 }}>{(d.lastError as string) ?? '—'}</td>
                          <td data-label="When" className="muted">{fmt(d.createdAt)}</td>
                        </>}
                        detail={<Detail r={d} labels={{ lastError: 'Last error', attempts: 'Attempts', paymentId: 'Payment ID', orderId: 'Order ID' }} />}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </SectionCard>

      {/* 4. Chat image review queue */}
      <SectionCard title="🖼️ Chat image review queue" count={images.rows.length}>
        <ImageScanToggle />
        {images.loading ? <p className="muted">Loading…</p>
          : images.rows.length === 0 ? <p className="drawer-muted">No images queued.</p>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table className="cardify">
                  <thead><tr><th></th><th>Status</th><th>Consultation</th><th>When</th><th></th></tr></thead>
                  <tbody>
                    {images.rows.map((im) => (
                      <OpsRow key={im.id} collection="imageModeration" id={im.id} cols={5}
                        cells={<>
                          <td data-label="Status"><span className="badge">{(im.status as string) ?? 'pending'}</span></td>
                          <td data-label="Consultation" className="muted">{(im.consultationId as string)?.slice(0, 12) ?? '—'}</td>
                          <td data-label="When" className="muted">{fmt(im.createdAt)}</td>
                        </>}
                        detail={<Detail r={im} labels={{ status: 'Result', reason: 'Why (flag reason)', labels: 'Detected labels', path: 'Image path', consultationId: 'Consultation' }} />}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </SectionCard>
    </div>
  );
}
