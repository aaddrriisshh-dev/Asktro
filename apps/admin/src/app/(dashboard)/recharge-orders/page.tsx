'use client';

import { useMemo, useState } from 'react';
import { orderBy, limit } from 'firebase/firestore';
import { useCollection, useNamesByIds, callFn } from '@/lib/hooks';
import { formatPaise, formatDate } from '@/lib/format';
import { Metric } from '@/components/Metric';
import { DateFilter } from '@/components/DateFilter';
import { Preset, resolveRange } from '@/lib/dateRange';

/**
 * Recharge funnel — every recharge ORDER created (rechargeOrders collection,
 * written by wallet/recharge.ts), whether it was paid or abandoned. An order
 * that got `creditedPaymentId` was paid + credited; one without it was started
 * but never completed.
 *
 * A "Pending" order can't tell us WHY from our own data (abandoned / declined /
 * paid-but-not-credited). The per-row "Check" button asks Razorpay live via the
 * reconcileRechargeOrder callable and shows the real verdict — and if it finds a
 * genuinely captured payment we never credited, it recovers it on the spot.
 */

type Verdict = 'credited' | 'recovered' | 'paid_uncredited' | 'declined' | 'abandoned';
interface Reconcile {
  verdict: Verdict;
  attempts: number;
  recovered: { walletCreditPaise: number; bonusPaise: number } | null;
  lastError: string | null;
}

/** verdict → badge class + label. */
const VERDICT: Record<Verdict, { cls: string; label: string }> = {
  credited: { cls: 'green', label: 'Credited' },
  recovered: { cls: 'green', label: 'Recovered ✓' },
  paid_uncredited: { cls: 'red', label: 'PAID — needs fix' },
  declined: { cls: 'red', label: 'Declined' },
  abandoned: { cls: 'gold', label: 'Abandoned' },
};

export default function RechargeOrdersPage() {
  const [preset, setPreset] = useState<Preset>('allTime');
  const [custom, setCustom] = useState<{ start?: string; end?: string }>({});
  const [perPage, setPerPage] = useState(25);
  const [page, setPage] = useState(0);
  const [checks, setChecks] = useState<Record<string, Reconcile | 'loading' | { error: string }>>({});
  const range = resolveRange(preset, custom);

  // Live latest 500; the selected date range is applied client-side (useCollection
  // re-keys on constraint COUNT, not value, so range is filtered here).
  const { rows, loading } = useCollection('rechargeOrders', [orderBy('createdAt', 'desc'), limit(500)]);

  const inRange = useMemo(
    () => rows.filter((r) => {
      const ms = r.createdAt?.toMillis?.() ?? 0;
      return ms >= range.start && ms < range.end;
    }),
    [rows, range.start, range.end],
  );

  const credited = inRange.filter((r) => !!r.creditedPaymentId);
  const rate = inRange.length ? Math.round((credited.length / inRange.length) * 100) : 0;

  const pageCount = Math.max(1, Math.ceil(inRange.length / perPage));
  const safePage = Math.min(page, pageCount - 1);
  const startIdx = safePage * perPage;
  const pageRows = inRange.slice(startIdx, startIdx + perPage);

  const userNames = useNamesByIds('users', pageRows.map((r) => String(r.userId ?? '')));

  async function check(orderId: string) {
    setChecks((c) => ({ ...c, [orderId]: 'loading' }));
    try {
      const res = await callFn<Reconcile>('reconcileRechargeOrder', { orderId });
      setChecks((c) => ({ ...c, [orderId]: res }));
    } catch (e) {
      setChecks((c) => ({ ...c, [orderId]: { error: (e as Error).message } }));
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="live-head" style={{ marginBottom: 4 }}><span className="live-dot" />Recharge Orders</h1>
          <p className="muted" style={{ marginTop: 0, fontSize: 13, maxWidth: 640 }}>
            Every checkout started, live. &ldquo;Credited&rdquo; funded the wallet; &ldquo;Pending&rdquo; never completed —
            hit <strong>Check</strong> on a pending row to ask Razorpay what actually happened. Latest 500.
          </p>
        </div>
        <DateFilter
          preset={preset}
          custom={custom}
          onPreset={(p) => { setPreset(p); setPage(0); }}
          onCustom={(c) => { setCustom(c); setPage(0); }}
        />
      </div>

      <div className="metricgrid" style={{ margin: '14px 0 18px' }}>
        <Metric color="c-purple" label="🧾 Orders" value={inRange.length.toLocaleString('en-IN')} big />
        <Metric color="c-green" label="✅ Credited" value={credited.length.toLocaleString('en-IN')} big />
        <Metric color="c-gold" label="📈 Conversion" value={`${rate}%`} big />
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
                  <tr><th>User</th><th>Amount</th><th>Plan</th><th>Status</th><th>Created</th><th>Check</th></tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => {
                    const done = !!r.creditedPaymentId;
                    const chk = checks[r.id];
                    return (
                      <tr key={r.id}>
                        <td data-label="User">{userNames.get(String(r.userId ?? '')) || (String(r.userId ?? '').slice(0, 10) || '—')}</td>
                        <td data-label="Amount" className="uat-amount">{formatPaise((r.amountPaise as number) ?? 0)}</td>
                        <td data-label="Plan" className="muted">{(r.planId as string) ?? '—'}</td>
                        <td data-label="Status">
                          {done ? (
                            <span className="badge green">Credited</span>
                          ) : chk === 'loading' ? (
                            <span className="badge amber">Checking…</span>
                          ) : chk && 'error' in chk ? (
                            <span className="badge red" title={chk.error}>Check failed</span>
                          ) : chk ? (
                            <div>
                              <span className={`badge ${VERDICT[chk.verdict].cls}`}>{VERDICT[chk.verdict].label}</span>
                              {chk.verdict === 'recovered' && chk.recovered && (
                                <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                                  +{formatPaise(chk.recovered.walletCreditPaise + chk.recovered.bonusPaise)} credited now
                                </div>
                              )}
                              {chk.verdict === 'declined' && chk.lastError && (
                                <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{chk.lastError}</div>
                              )}
                              {chk.verdict === 'abandoned' && (
                                <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>No payment attempt</div>
                              )}
                            </div>
                          ) : (
                            <span className="badge amber">Pending</span>
                          )}
                        </td>
                        <td data-label="Created" className="muted">{formatDate(r.createdAt?.toMillis?.())}</td>
                        <td data-label="Check">
                          {done ? (
                            <span className="muted">—</span>
                          ) : (
                            <button
                              className="btn sm secondary"
                              disabled={chk === 'loading'}
                              onClick={() => check(r.id)}
                            >
                              {chk === 'loading' ? '…' : chk ? 'Re-check' : 'Check'}
                            </button>
                          )}
                        </td>
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
