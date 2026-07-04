'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatPaise, shortDay } from '@/lib/format';
import { useCardFilter } from '@/lib/useCardFilter';
import { Range } from '@/lib/dateRange';
import { DrawerFilter } from './DrawerFilter';

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// ---------------------------------------------------------------- panel shell
function OpsPanel({
  title, description, icon, colorClass, wide, defaultOpen = true, children,
}: {
  title: string; description: string; icon: ReactNode; colorClass: string;
  wide?: boolean; defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`ops ${colorClass}${wide ? ' ops--wide' : ''}`}>
      <button className="ops-head" onClick={() => setOpen((o) => !o)}>
        <span className="ops-ico">{icon}</span>
        <span className="ops-titles">
          <strong>{title}</strong>
          <em>{description}</em>
        </span>
        <span className="ops-caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && <div className="ops-body">{children}</div>}
    </section>
  );
}

function Skel({ h = 200 }: { h?: number }) { return <div className="dashcard__skel" style={{ height: h, width: '100%' }} />; }

const axis = { fontSize: 11, fill: '#9891c2' };
const gridStroke = '#efeafc';
const tooltipStyle = { background: '#fff', border: '1px solid #ece4fb', borderRadius: 10, color: '#2e2b5f' };

// ---------------------------------------------------------------- icons
const I = (p: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{p}</svg>
);
const iconBell = I(<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>);
const iconTrend = I(<><path d="M23 6l-9.5 9.5-5-5L1 18" /><path d="M17 6h6v6" /></>);
const iconUsers = I(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></>);
const iconChat = I(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />);
const iconStar = I(<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />);
const iconWallet = I(<><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" /></>);
const iconTrophy = I(<><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></>);

// ================================================================ 1. Needs attention
function NeedsAttention() {
  const [d, setD] = useState<{ tickets: number; payouts: number; approvals: number } | null>(null);
  useEffect(() => {
    (async () => {
      const [tk, po, as] = await Promise.all([
        getDocs(query(collection(db, 'supportTickets'), where('status', '==', 'open'))),
        getDocs(query(collection(db, 'payouts'), where('status', '==', 'pending'))),
        getDocs(query(collection(db, 'astrologers'), where('accountStatus', '==', 'pending'))),
      ]);
      setD({ tickets: tk.size, payouts: po.size, approvals: as.size });
    })().catch(() => setD({ tickets: 0, payouts: 0, approvals: 0 }));
  }, []);
  const items = [
    { href: '/support', label: 'Open support tickets', hint: 'Users & astrologers awaiting a reply', n: d?.tickets, cls: 'c-red' },
    { href: '/payouts', label: 'Pending payouts', hint: 'Astrologer withdrawals to approve & pay', n: d?.payouts, cls: 'c-bronze' },
    { href: '/astrologers', label: 'Astrologers to approve', hint: 'New profiles waiting for verification', n: d?.approvals, cls: 'c-blue' },
  ];
  return (
    <div className="na-grid">
      {items.map((it) => (
        <Link key={it.href} href={it.href} className={`na-tile ${it.cls}`}>
          <span className="na-n">{d ? it.n : '—'}</span>
          <span className="na-label">{it.label}</span>
          <span className="na-hint">{it.hint}</span>
          <span className="na-go">Open →</span>
        </Link>
      ))}
    </div>
  );
}

// ================================================================ 2. Revenue trend
function RevenueTrend() {
  const { preset, setPreset, custom, setCustom, range } = useCardFilter('ops_revenue', 'last30');
  const [data, setData] = useState<{ day: string; value: number }[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    (async () => {
      const snap = await getDocs(query(
        collection(db, 'walletTransactions'),
        where('createdAt', '>=', Timestamp.fromMillis(range.start)),
        where('createdAt', '<', Timestamp.fromMillis(range.end)),
        orderBy('createdAt', 'asc'),
      ));
      const byDay = new Map<string, number>();
      snap.forEach((doc) => {
        const t = doc.data() as { kind?: string; amount?: number; createdAt?: Timestamp };
        if (t.kind !== 'recharge') return;
        const k = dayKey(t.createdAt?.toMillis?.() ?? range.start);
        byDay.set(k, (byDay.get(k) ?? 0) + (t.amount ?? 0));
      });
      if (!cancelled) setData([...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day: shortDay(day), value: Math.round(v / 100) })));
    })().catch(() => { if (!cancelled) setData([]); });
    return () => { cancelled = true; };
  }, [range.start, range.end]);
  return (
    <>
      <div className="ops-filter"><DrawerFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} /></div>
      {!data ? <Skel h={230} /> : (
    <div style={{ height: 230 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs><linearGradient id="opsrev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2f9c63" stopOpacity={0.35} /><stop offset="100%" stopColor="#2f9c63" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
          <XAxis dataKey="day" tick={axis} stroke="#e7e1f5" /><YAxis tick={axis} stroke="#e7e1f5" />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} />
          <Area type="monotone" dataKey="value" stroke="#2f9c63" strokeWidth={2} fill="url(#opsrev)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
      )}
    </>
  );
}

// ================================================================ 3. Paid vs Free
function PaidVsFree() {
  const { preset, setPreset, custom, setCustom, range } = useCardFilter('ops_paidfree', 'allTime');
  const [d, setD] = useState<{ paid: number; free: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setD(null);
    (async () => {
      const snap = await getDocs(query(
        collection(db, 'users'),
        where('createdAt', '>=', Timestamp.fromMillis(range.start)),
        where('createdAt', '<', Timestamp.fromMillis(range.end)),
      ));
      let paid = 0, free = 0;
      snap.forEach((doc) => { ((doc.data() as { totalRecharge?: number }).totalRecharge ?? 0) > 0 ? paid++ : free++; });
      if (!cancelled) setD({ paid, free });
    })().catch(() => { if (!cancelled) setD({ paid: 0, free: 0 }); });
    return () => { cancelled = true; };
  }, [range.start, range.end]);
  const total = (d?.paid ?? 0) + (d?.free ?? 0) || 1;
  const pct = Math.round(((d?.paid ?? 0) / total) * 100);
  return (
    <>
      <div className="ops-filter"><DrawerFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} /></div>
      {!d ? <Skel h={210} /> : (
    <div className="pvf">
      <div className="pvf-chart">
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Pie data={[{ name: 'Paid', value: d.paid }, { name: 'Free', value: d.free }]} dataKey="value" innerRadius={58} outerRadius={82} paddingAngle={2} stroke="none">
              <Cell fill="#d0567e" /><Cell fill="#e7e1f5" />
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pvf-center"><strong>{pct}%</strong><span>paid</span></div>
      </div>
      <div className="pvf-legend">
        <div><i style={{ background: '#d0567e' }} /> Paid users <b>{d.paid.toLocaleString('en-IN')}</b></div>
        <div><i style={{ background: '#c9c4e0' }} /> Free users <b>{d.free.toLocaleString('en-IN')}</b></div>
      </div>
    </div>
      )}
    </>
  );
}

// ================================================================ 4. Consultation activity
function ConsultationActivity() {
  const { preset, setPreset, custom, setCustom, range } = useCardFilter('ops_consult', 'last30');
  const [data, setData] = useState<{ day: string; chat: number; voice: number; video: number }[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    (async () => {
      const snap = await getDocs(query(
        collection(db, 'consultations'),
        where('createdAt', '>=', Timestamp.fromMillis(range.start)),
        where('createdAt', '<', Timestamp.fromMillis(range.end)),
        orderBy('createdAt', 'asc'),
      ));
      const byDay = new Map<string, { chat: number; voice: number; video: number }>();
      snap.forEach((doc) => {
        const c = doc.data() as { type?: string; createdAt?: Timestamp };
        const k = dayKey(c.createdAt?.toMillis?.() ?? range.start);
        const cur = byDay.get(k) ?? { chat: 0, voice: 0, video: 0 };
        if (c.type === 'chat') cur.chat++; else if (c.type === 'voice') cur.voice++; else if (c.type === 'video') cur.video++;
        byDay.set(k, cur);
      });
      if (!cancelled) setData([...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day: shortDay(day), ...v })));
    })().catch(() => { if (!cancelled) setData([]); });
    return () => { cancelled = true; };
  }, [range.start, range.end]);
  return (
    <>
      <div className="ops-filter"><DrawerFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} /></div>
      {!data ? <Skel h={230} /> : (
    <div style={{ height: 230 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
          <XAxis dataKey="day" tick={axis} stroke="#e7e1f5" /><YAxis tick={axis} stroke="#e7e1f5" allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="chat" stackId="a" fill="#7e57c2" radius={[0, 0, 0, 0]} />
          <Bar dataKey="voice" stackId="a" fill="#3b6fd4" />
          <Bar dataKey="video" stackId="a" fill="#12a594" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
      )}
    </>
  );
}

// ================================================================ 5. Astrologer supply
function AstrologerSupply() {
  const [d, setD] = useState<{ online: number; total: number; male: number; female: number } | null>(null);
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, 'astrologers'));
      let online = 0, male = 0, female = 0;
      snap.forEach((doc) => {
        const a = doc.data() as { onlineStatus?: boolean; gender?: string };
        if (a.onlineStatus) online++;
        if (a.gender === 'male') male++; else if (a.gender === 'female') female++;
      });
      setD({ online, total: snap.size, male, female });
    })().catch(() => setD({ online: 0, total: 0, male: 0, female: 0 }));
  }, []);
  if (!d) return <Skel h={230} />;
  const offline = Math.max(0, d.total - d.online);
  const gTotal = d.male + d.female || 1;
  return (
    <div className="pvf">
      <div className="pvf-chart">
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Pie data={[{ name: 'Online', value: d.online }, { name: 'Offline', value: offline }]} dataKey="value" innerRadius={58} outerRadius={82} paddingAngle={2} stroke="none">
              <Cell fill="#12a594" /><Cell fill="#e7e1f5" />
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pvf-center"><strong>{d.online}</strong><span>online now</span></div>
      </div>
      <div className="pvf-legend">
        <div><i style={{ background: '#12a594' }} /> Online <b>{d.online}</b></div>
        <div><i style={{ background: '#c9c4e0' }} /> Offline <b>{offline}</b></div>
        <div className="pvf-split">
          <span>Male {d.male} · Female {d.female}</span>
          <div className="pvf-bar"><span style={{ width: `${(d.male / gTotal) * 100}%`, background: '#5b5bd6' }} /><span style={{ width: `${(d.female / gTotal) * 100}%`, background: '#d0567e' }} /></div>
        </div>
      </div>
    </div>
  );
}

// ================================================================ 6. Money held & owed
function MoneyHeldOwed() {
  const [d, setD] = useState<{ held: number; owed: number } | null>(null);
  useEffect(() => {
    (async () => {
      const [us, po] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(query(collection(db, 'payouts'), where('status', 'in', ['pending', 'approved']))),
      ]);
      let held = 0; us.forEach((doc) => { const u = doc.data() as { walletBalance?: number; bonusBalance?: number }; held += (u.walletBalance ?? 0) + (u.bonusBalance ?? 0); });
      let owed = 0; po.forEach((doc) => { owed += (doc.data() as { amount?: number }).amount ?? 0; });
      setD({ held, owed });
    })().catch(() => setD({ held: 0, owed: 0 }));
  }, []);
  if (!d) return <Skel h={120} />;
  return (
    <div className="mho">
      <div className="mho-fig c-blue">
        <span className="mho-label">Customer wallet balance held</span>
        <strong>{formatPaise(d.held)}</strong>
        <span className="mho-hint">Money customers have loaded but not yet spent — a liability on your books.</span>
      </div>
      <div className="mho-fig c-bronze">
        <span className="mho-label">Pending payouts owed</span>
        <strong>{formatPaise(d.owed)}</strong>
        <span className="mho-hint">Earnings you still owe astrologers (requested or approved, not yet paid).</span>
      </div>
    </div>
  );
}

// ================================================================ 7. Top astrologers
function TopAstrologers() {
  const [rows, setRows] = useState<{ name: string; cons: number; rating: number; earnings: number }[] | null>(null);
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, 'astrologers'));
      const list = snap.docs.map((doc) => {
        const a = doc.data() as { name?: string; totalConsultations?: number; rating?: number; earnings?: number };
        return { name: a.name ?? '—', cons: a.totalConsultations ?? 0, rating: a.rating ?? 0, earnings: a.earnings ?? 0 };
      }).sort((a, b) => b.earnings - a.earnings).slice(0, 8);
      setRows(list);
    })().catch(() => setRows([]));
  }, []);
  if (!rows) return <Skel h={200} />;
  if (rows.length === 0) return <p className="drawer-muted">No astrologers yet.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="ops-table">
        <thead><tr><th>#</th><th>Astrologer</th><th>Consultations</th><th>Rating</th><th>Earnings</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><span className={`ops-rank r${i + 1}`}>{i + 1}</span></td>
              <td className="ops-name">{r.name}</td>
              <td>{r.cons.toLocaleString('en-IN')}</td>
              <td>{r.rating ? `${r.rating} ★` : '—'}</td>
              <td className="ops-earn">{formatPaise(r.earnings)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ================================================================ section
export function OperationsSection() {
  return (
    <div className="ops-wrap">
      <h2 className="ops-heading"><span className="ops-heading-dot" />Operations &amp; Insights</h2>
      <p className="ops-sub">The metrics to watch daily — trends, monetisation, supply and what needs your action. Click any panel header to collapse it.</p>

      <div className="opsgrid">
        <OpsPanel wide title="Needs attention" description="Live to-do queue — items waiting on you right now" icon={iconBell} colorClass="c-red">
          <NeedsAttention />
        </OpsPanel>

        <OpsPanel title="Revenue trend" description="Daily gross revenue from recharges — pick any date range" icon={iconTrend} colorClass="c-green">
          <RevenueTrend />
        </OpsPanel>

        <OpsPanel title="Paid vs free users" description="Share of users (by sign-up date) who have ever recharged" icon={iconUsers} colorClass="c-rose">
          <PaidVsFree />
        </OpsPanel>

        <OpsPanel title="Consultation activity" description="Sessions per day by type — chat, voice, video — pick any date range" icon={iconChat} colorClass="c-blue">
          <ConsultationActivity />
        </OpsPanel>

        <OpsPanel title="Astrologer supply" description="How many astrologers are online now vs total, and the gender mix" icon={iconStar} colorClass="c-teal">
          <AstrologerSupply />
        </OpsPanel>

        <OpsPanel wide title="Money held &amp; owed" description="Your financial exposure — wallet liability and unpaid astrologer earnings" icon={iconWallet} colorClass="c-bronze">
          <MoneyHeldOwed />
        </OpsPanel>

        <OpsPanel wide title="Top astrologers" description="Best performers by earnings — who to feature and reward" icon={iconTrophy} colorClass="c-indigo" defaultOpen={false}>
          <TopAstrologers />
        </OpsPanel>
      </div>
    </div>
  );
}
