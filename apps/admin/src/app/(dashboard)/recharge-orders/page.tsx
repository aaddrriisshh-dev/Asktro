'use client';

import { useMemo, useState } from 'react';
import { orderBy, limit } from 'firebase/firestore';
import { useCollection, useNamesByIds } from '@/lib/hooks';
import { formatPaise, formatDate } from '@/lib/format';
import { DateFilter } from '@/components/DateFilter';
import { Preset, resolveRange } from '@/lib/dateRange';

/**
 * Recharge funnel — every recharge ORDER created (rechargeOrders collection,
 * written by wallet/recharge.ts), whether it was paid or abandoned. An order
 * that got `creditedPaymentId` was paid + credited; one without it was started
 * but never completed. Complements the Recharges page (which shows only
 * successful credits) by exposing conversion + abandoned checkouts. Live.
 */
export default function RechargeOrdersPage() {
  const [preset, setPreset] = useState<Preset>('allTime');
  const [custom, setCustom] = useState<{ start?: string; end?: string }>({});
  const [perPage, setPerPage] = useState(25);
  const [page, setPage] = useState(0);
  const range = resolveRange(preset, custom);

  // Live latest 500; the selected date range is applied client-side (useCollection
  // re-keys on constraint COUNT, not value, so range is filtered here).
  const { rows, loading } = useCollection('rechargeOrders', [orderBy('createdAt', 'desc'), limit(500)]);

  // Filter to the chosen date range. Re-derived on range change; the page cursor
  // is reset (below) whenever the range or rows-per-page changes so the admin
  // never lands on an empty page after narrowing.
  const inRange = useMemo(
    () => rows.filter((r) => {
      const ms = r.createdAt?.toMillis?.() ?? 0;
      return ms >= range.start && ms < range.end;
    }),
    [rows, range.start, range.end],
  );

  const credited = inRange.filter((r) => !!r.creditedPaymentId);
  const rate = inRange.length ? Math.round((credited.length / inRange.length) * 100) : 0;

  // Clamp the page into the valid window (range/perPage may have shrunk it).
  const pageCount = Math.max(1, Math.ceil(inRange.length / perPage));
  const safePage = Math.min(page, pageCount - 1);
  const startIdx = safePage * perPage;
  const pageRows = inRange.slice(startIdx, startIdx + perPage);

  const userNames = useNamesByIds('users', pageRows.map((r) => String(r.userId ?? '')));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Recharge Orders</h1>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Orders started at checkout. &ldquo;Credited&rdquo; completed &amp; funded the wallet; &ldquo;Pending&rdquo; were started but never paid (abandoned). Latest 500.
          </p>
        </div>
        <DateFilter
          preset={preset}
          custom={custom}
          onPreset={(p) => { setPreset(p); setPage(0); }}
          onCustom={(c) => { setCustom(c); setPage(0); }}
        />
      </div>
      <div className="metricgrid" style={{ margin: '4px 0 14px' }}>
        <div className="aview-stat"><div className="k">🧾 Orders</div><div className="v">{inRange.length.toLocaleString('en-IN')}</div></div>
        <div className="aview-stat"><div className="k">✅ Credited</div><div className="v">{credited.length.toLocaleString('en-IN')}</div></div>
        <div className="aview-stat"><div className="k">📈 Conversion</div><div className="v">{rate}%</div></div>
      </div>
      <div className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : inRange.length === 0 ? (
          <p className="muted">No recharge orders in {range.label.toLowerCase()}.</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="cardify">
                <thead>
                  <tr><th>User</th><th>Amount</th><th>Plan</th><th>Status</th><th>Created</th></tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => {
                    const done = !!r.creditedPaymentId;
                    return (
                      <tr key={r.id}>
                        <td data-label="User">{userNames.get(String(r.userId ?? '')) || (String(r.userId ?? '').slice(0, 10) || '—')}</td>
                        <td data-label="Amount" className="uat-amount">{formatPaise((r.amountPaise as number) ?? 0)}</td>
                        <td data-label="Plan" className="muted">{(r.planId as string) ?? '—'}</td>
                        <td data-label="Status"><span className={`badge ${done ? 'green' : 'amber'}`}>{done ? 'Credited' : 'Pending'}</span></td>
                        <td data-label="Created" className="muted">{formatDate(r.createdAt?.toMillis?.())}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="uat-foot">
              <span className="muted">
                {`Showing ${startIdx + 1}–${startIdx + pageRows.length} of ${inRange.length.toLocaleString('en-IN')}`}
              </span>
              <div className="uat-pager">
                <label className="muted">Rows
                  <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(0); }}>
                    <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
                  </select>
                </label>
                <button className="uat-pg" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>‹</button>
                <span className="uat-pgn">Page {safePage + 1} of {pageCount}</span>
                <button className="uat-pg" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>›</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
