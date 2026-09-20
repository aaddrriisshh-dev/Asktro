'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { where, orderBy, limit, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useCollection, useNamesByIds, callFn, Row } from '@/lib/hooks';
import { DateFilter } from '@/components/DateFilter';
import { Preset, resolveRange } from '@/lib/dateRange';

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
function Detail({ r, labels, extra }: { r: Row; labels?: Record<string, string>; extra?: React.ReactNode }) {
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
      {extra}
      {primary.map((k) => rowFor(k, labels![k]))}
      {rest.map((k) => rowFor(k, k))}
    </div>
  );
}

/** Turn a Cloud Vision safeSearch verdict into a plain reason, e.g.
 *  "racy: likely, adult: possible". Empty when everything is safe. */
const LIKELY_ORDER = ['POSSIBLE', 'LIKELY', 'VERY_LIKELY'];
function visionReason(ss: unknown): string {
  if (!ss || typeof ss !== 'object') return '';
  const hits = Object.entries(ss as Record<string, string>)
    .filter(([, v]) => LIKELY_ORDER.includes(String(v)))
    .map(([k, v]) => `${k}: ${String(v).toLowerCase().replace('_', ' ')}`);
  return hits.join(', ');
}

/** Thumbnail for a queued chat image (best-effort). Removed/unsafe images are
 *  already deleted from Storage, so the fetch fails → we show a note instead. */
function ImageThumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!path) { setGone(true); return; }
    getDownloadURL(storageRef(storage, path))
      .then((u) => { if (!cancelled) setUrl(u); })
      .catch(() => { if (!cancelled) setGone(true); });
    return () => { cancelled = true; };
  }, [path]);
  if (gone) return <span className="muted" style={{ fontSize: 12 }}>image removed / not available</span>;
  if (!url) return <span className="muted" style={{ fontSize: 12 }}>loading preview…</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="chat upload" style={{ maxWidth: 220, maxHeight: 220, borderRadius: 10, border: '1px solid var(--line, #eee)' }} />;
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
  // Fetch recent history (not just open items) so a "show resolved" toggle can
  // reveal already-actioned items — nothing is lost once resolved.
  const [showResolved, setShowResolved] = useState(false);
  const [preset, setPreset] = useState<Preset>('allTime');
  const [custom, setCustom] = useState<{ start?: string; end?: string }>({});
  const range = resolveRange(preset, custom);
  const inRange = (r: Row) => {
    const ms = r.createdAt?.toMillis?.() ?? 0;
    return ms >= range.start && ms < range.end;
  };
  const recentC = useMemo(() => [orderBy('createdAt', 'desc'), limit(200)], []);
  const imgC = useMemo(() => [orderBy('createdAt', 'desc'), limit(50)], []);

  const reports = useCollection('reports', recentC);
  const alerts = useCollection('alerts', recentC);
  const deadletters = useCollection('failedWebhookCredits', recentC);
  const images = useCollection('imageModeration', imgC);

  const isOpenReport = (r: Row) => (r.status ?? 'open') !== 'resolved';
  const isOpen = (r: Row) => r.resolved !== true;
  const reportRows = [...reports.rows].sort(byNewest).filter((r) => inRange(r) && (showResolved || isOpenReport(r)));
  const alertRows = [...alerts.rows].sort(byNewest).filter((r) => inRange(r) && (showResolved || isOpen(r)));
  const dlRows = [...deadletters.rows].sort(byNewest).filter((r) => inRange(r) && (showResolved || isOpen(r)));
  const imageRows = [...images.rows].sort(byNewest).filter((r) => inRange(r) && (showResolved || isOpen(r)));

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>🛡️ Trust &amp; Safety</h1>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            User reports, content flags, payment failures, and operational alerts — tap any row to read the full details, then resolve.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <DateFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} />
          <button className={`btn sm ${showResolved ? '' : 'secondary'}`} onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? '● Showing resolved too' : 'Show resolved (history)'}
          </button>
        </div>
      </div>

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
      <SectionCard title="🖼️ Chat image review queue" count={imageRows.length}>
        <ImageScanToggle />
        {images.loading ? <p className="muted">Loading…</p>
          : imageRows.length === 0 ? <p className="drawer-muted">No images queued.</p>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table className="cardify">
                  <thead><tr><th></th><th>Status</th><th>Why</th><th>Consultation</th><th>When</th><th></th></tr></thead>
                  <tbody>
                    {imageRows.map((im) => {
                      const why = visionReason(im.safeSearch);
                      return (
                      <OpsRow key={im.id} collection="imageModeration" id={im.id} cols={6}
                        cells={<>
                          <td data-label="Status"><span className="badge">{(im.status as string) ?? 'pending'}</span></td>
                          <td data-label="Why" className="muted" style={{ fontSize: 12.5 }}>{why || (im.status === 'removed' ? 'unsafe' : 'clean')}</td>
                          <td data-label="Consultation" className="muted">{(im.consultationId as string)?.slice(0, 12) ?? '—'}</td>
                          <td data-label="When" className="muted">{fmt(im.createdAt)}</td>
                        </>}
                        detail={<Detail r={im}
                          labels={{ status: 'Result', path: 'Image path', consultationId: 'Consultation', safeSearch: 'Scan verdict' }}
                          extra={<>
                            <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, padding: '3px 0' }}>
                              <span className="muted" style={{ fontSize: 12 }}>Why (flag reason)</span>
                              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{why || (im.status === 'removed' ? 'unsafe image' : 'no issues found')}</span>
                            </div>
                            <div style={{ padding: '6px 0 10px' }}><ImageThumb path={String(im.path ?? '')} /></div>
                          </>}
                        />}
                      />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
      </SectionCard>
    </div>
  );
}
