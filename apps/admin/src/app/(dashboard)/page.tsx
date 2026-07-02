'use client';

import { useCollection } from '@/lib/hooks';
import { formatPaise } from '@/lib/format';
import { where } from 'firebase/firestore';

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      <div className="kpi-value" style={{ color: 'var(--primary)' }}>{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  const users = useCollection('users');
  const astrologers = useCollection('astrologers');
  const active = useCollection('consultations', [where('status', '==', 'active')]);
  const online = useCollection('astrologers', [where('onlineStatus', '==', true)]);
  const pendingPayouts = useCollection('payouts', [where('status', '==', 'pending')]);
  const openTickets = useCollection('supportTickets', [where('status', '==', 'open')]);

  const totalPayout = pendingPayouts.rows.reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Kpi label="Registered users" value={String(users.rows.length)} />
        <Kpi label="Astrologers" value={String(astrologers.rows.length)} />
        <Kpi label="Active consultations" value={String(active.rows.length)} />
        <Kpi label="Astrologers online" value={String(online.rows.length)} />
        <Kpi label="Pending payouts" value={`${pendingPayouts.rows.length} · ${formatPaise(totalPayout)}`} />
        <Kpi label="Open support tickets" value={String(openTickets.rows.length)} />
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h3 style={{ marginTop: 0 }}>Live activity</h3>
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
