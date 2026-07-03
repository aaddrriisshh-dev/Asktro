'use client';

import { ReactNode } from 'react';
import { useCollection } from '@/lib/hooks';
import { formatPaise } from '@/lib/format';
import { where } from 'firebase/firestore';

/* premium line icons (gold stroke via currentColor) */
const svg = (path: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
);
const ICONS = {
  users: svg(<>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </>),
  star: svg(<path d="M12 2.5l2.2 6.4 6.8.3-5.3 4.2 1.8 6.6L12 16.9 6.5 20l1.8-6.6L3 9.2l6.8-.3z" />),
  chat: svg(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
  signal: svg(<><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" /></>),
  wallet: svg(<><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /><path d="M21 12a2 2 0 0 0-2-2h-4a2 2 0 0 0 0 4h4a2 2 0 0 0 2-2z" /></>),
  ticket: svg(<path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" />),
};

/* small decorative sparkline (a gentle upward trend) */
function Spark() {
  return (
    <svg className="stat__spark" width="58" height="22" viewBox="0 0 58 22" fill="none">
      <polyline
        points="1,17 10,13 19,15 28,8 37,11 46,5 57,3"
        stroke="var(--c)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="57" cy="3" r="2.4" fill="var(--c)" />
    </svg>
  );
}

function Stat({
  icon,
  label,
  value,
  pill,
  tone,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  pill: string;
  tone?: 'green' | 'amber';
  color: string;
}) {
  return (
    <div className={`stat ${color}`}>
      <div className="stat__label">
        <span className="stat__icon">{icon}</span>
        {label}
      </div>
      <div className="stat__value">{value}</div>
      <div className="stat__foot">
        <span className={`stat__pill${tone ? ' ' + tone : ''}`}>{pill}</span>
        <Spark />
      </div>
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

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        <Stat color="c-purple" icon={ICONS.users} label="Registered users" value={String(users.rows.length)} pill="all time" />
        <Stat color="c-gold" icon={ICONS.star} label="Astrologers" value={String(astrologers.rows.length)} pill={`${online.rows.length} online`} tone="green" />
        <Stat color="c-blue" icon={ICONS.chat} label="Active consultations" value={String(active.rows.length)} pill={active.rows.length > 0 ? 'live now' : 'idle'} tone={active.rows.length > 0 ? 'green' : undefined} />
        <Stat color="c-green" icon={ICONS.signal} label="Astrologers online" value={String(online.rows.length)} pill={`of ${astrologers.rows.length}`} tone="green" />
        <Stat color="c-amber" icon={ICONS.wallet} label="Pending payouts" value={String(pendingPayouts.rows.length)} pill={formatPaise(totalPayout)} tone="amber" />
        <Stat color="c-rose" icon={ICONS.ticket} label="Open support tickets" value={String(openTickets.rows.length)} pill={openTickets.rows.length > 0 ? 'needs action' : 'all clear'} tone={openTickets.rows.length > 0 ? 'amber' : 'green'} />
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
