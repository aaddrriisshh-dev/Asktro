'use client';

import { orderBy, limit } from 'firebase/firestore';
import { useCollection } from '@/lib/hooks';
import { formatPaise, formatDate } from '@/lib/format';

/**
 * Recharge funnel — every recharge ORDER created (rechargeOrders collection,
 * written by wallet/recharge.ts), whether it was paid or abandoned. An order
 * that got `creditedPaymentId` was paid + credited; one without it was started
 * but never completed. Complements the Recharges page (which shows only
 * successful credits) by exposing conversion + abandoned checkouts. Live.
 */
export default function RechargeOrdersPage() {
  const { rows, loading } = useCollection('rechargeOrders', [orderBy('createdAt', 'desc'), limit(300)]);

  const credited = rows.filter((r) => !!r.creditedPaymentId);
  const rate = rows.length ? Math.round((credited.length / rows.length) * 100) : 0;

  return (
    <div>
      <h1>Recharge Orders</h1>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Orders started at checkout. “Credited” completed &amp; funded the wallet; “Pending” were started but never paid (abandoned). Latest 300.
      </p>
      <div className="metricgrid" style={{ marginBottom: 14 }}>
        <div className="aview-stat"><div className="k">🧾 Orders</div><div className="v">{rows.length.toLocaleString('en-IN')}</div></div>
        <div className="aview-stat"><div className="k">✅ Credited</div><div className="v">{credited.length.toLocaleString('en-IN')}</div></div>
        <div className="aview-stat"><div className="k">📈 Conversion</div><div className="v">{rate}%</div></div>
      </div>
      <div className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No recharge orders yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cardify">
              <thead>
                <tr><th>User</th><th>Amount</th><th>Plan</th><th>Status</th><th>Created</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const done = !!r.creditedPaymentId;
                  return (
                    <tr key={r.id}>
                      <td data-label="User" style={{ fontFamily: 'monospace', fontSize: 12 }}>{(r.userId as string)?.slice(0, 10) ?? '—'}</td>
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
        )}
      </div>
    </div>
  );
}
