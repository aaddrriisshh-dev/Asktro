'use client';

import { orderBy, limit } from 'firebase/firestore';
import { useCollection } from '@/lib/hooks';
import { formatPaise, formatDate } from '@/lib/format';

/** Sales log of paid Kundali Match (Ashtakoota) reports — ₹49 each. Reads the
 *  admin-readable `kundliMatches` records written by purchaseKundliMatch. */
export default function KundaliDownloadsPage() {
  const { rows, loading } = useCollection('kundliMatches', [orderBy('purchasedAt', 'desc'), limit(200)]);
  const revenue = rows.reduce((n, r) => n + ((r.pricePaise as number) ?? 0), 0);

  return (
    <div>
      <h1>Kundali Downloads</h1>
      <p className="muted" style={{ marginTop: -6, marginBottom: 16 }}>
        Paid Ashtakoota Guna Milan reports — ₹49 each.
      </p>
      <div className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No paid reports yet.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
              <div>
                <div className="muted" style={{ fontSize: 12, letterSpacing: 0.5 }}>REPORTS SOLD</div>
                <strong style={{ fontSize: 22 }}>{rows.length}</strong>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 12, letterSpacing: 0.5 }}>REVENUE</div>
                <strong style={{ fontSize: 22 }}>{formatPaise(revenue)}</strong>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="cardify">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Partners</th>
                    <th>Score</th>
                    <th>Amount</th>
                    <th>Purchased</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Customer">
                        {(r.userName as string) ?? '—'}
                        {r.userPhone ? (
                          <div className="muted" style={{ fontSize: 12 }}>{r.userPhone as string}</div>
                        ) : null}
                      </td>
                      <td data-label="Partners">
                        {[r.selfName, r.partnerName].filter(Boolean).join('  &  ') || '—'}
                      </td>
                      <td data-label="Score">
                        {r.totalPoints != null ? `${r.totalPoints} / ${(r.maxPoints as number) ?? 36}` : '—'}
                      </td>
                      <td data-label="Amount">{formatPaise((r.pricePaise as number) ?? 4900)}</td>
                      <td data-label="Purchased">{formatDate(r.purchasedAt?.toMillis?.())}</td>
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
