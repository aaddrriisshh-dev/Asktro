'use client';

import { orderBy, limit } from 'firebase/firestore';
import { useCollection, useNamesByIds } from '@/lib/hooks';
import { formatPaise, formatDate } from '@/lib/format';

/**
 * Referral program overview — one row per credited referral (referrals collection,
 * written by referrals/referral.ts). Live. Shows who referred whom, the rewards
 * paid to each side, and the total rewards paid out.
 */
export default function ReferralsPage() {
  const { rows, loading } = useCollection('referrals', [orderBy('createdAt', 'desc'), limit(300)]);
  const names = useNamesByIds('users', rows.flatMap((r) => [String(r.referrerId ?? ''), String(r.referredId ?? '')]));
  const nm = (id: unknown) => {
    const s = String(id ?? '');
    return names.get(s) || (s ? s.slice(0, 10) : '—');
  };

  const rewardsPaid = rows.reduce(
    (s, r) => s + ((r.referrerReward as number) || 0) + ((r.referredReward as number) || 0),
    0,
  );

  return (
    <div>
      <h1>Referrals</h1>
      <div className="metricgrid" style={{ marginBottom: 14 }}>
        <div className="aview-stat"><div className="k">🔗 Referrals</div><div className="v">{rows.length.toLocaleString('en-IN')}</div></div>
        <div className="aview-stat"><div className="k">🎁 Rewards paid</div><div className="v">{formatPaise(rewardsPaid)}</div></div>
      </div>
      <div className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No referrals yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cardify">
              <thead>
                <tr><th>Referrer</th><th>Referred</th><th>Referrer reward</th><th>Referred reward</th><th>Status</th><th>When</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Referrer">{nm(r.referrerId)}</td>
                    <td data-label="Referred">{nm(r.referredId)}</td>
                    <td data-label="Referrer reward" className="uat-amount">{formatPaise((r.referrerReward as number) ?? 0)}</td>
                    <td data-label="Referred reward" className="uat-amount">{formatPaise((r.referredReward as number) ?? 0)}</td>
                    <td data-label="Status">{(() => {
                      const st = (r.status as string) ?? 'credited';
                      const cls = st === 'credited' || st === 'paid' ? 'green' : st === 'pending' ? 'amber' : 'red';
                      return <span className={`badge ${cls}`}>{st}</span>;
                    })()}</td>
                    <td data-label="When" className="muted">{formatDate(r.createdAt?.toMillis?.())}</td>
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
