'use client';

import { useCollection } from '@/lib/hooks';
import { formatPaise } from '@/lib/format';
import { where } from 'firebase/firestore';
import { RevenueCard } from '@/components/RevenueCard';

export default function DashboardPage() {
  const active = useCollection('consultations', [where('status', '==', 'active')]);

  return (
    <div>
      <div className="hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="hero__logo" src="/brand/asktro_logo.png" alt="Asktro" />
        <div className="hero__text">
          <h1 className="hero__greeting">Welcome back</h1>
          <p className="hero__sub">
            Your celestial marketplace at a glance — astrologers, consultations and wallets, in real time.
          </p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <RevenueCard />
      </div>

      <div className="card" style={{ marginTop: 22 }}>
        <h3 className="live-head"><span className="live-dot" />Live activity</h3>
        {active.rows.length === 0 ? (
          <p className="muted">No consultations in progress right now.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Consultation</th><th>Type</th><th>Billed</th><th>Charged</th></tr>
            </thead>
            <tbody>
              {active.rows.slice(0, 10).map((c) => (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.id.slice(0, 10)}</td>
                  <td>{c.type}</td>
                  <td>{c.billedSeconds ?? 0}s</td>
                  <td>{formatPaise(c.totalCharged)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
