'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useCollection, Row } from '@/lib/hooks';
import { formatPaise } from '@/lib/format';
import { MobileSection } from '@/components/MobileSection';
import { DrawerFilter } from '@/components/DrawerFilter';
import { useCardFilter } from '@/lib/useCardFilter';

const msOf = (t: { toMillis?: () => number } | undefined) => t?.toMillis?.() ?? 0;
// "Live" = a real presence heartbeat within the last few minutes (the customer
// app writes presence/{uid}.lastSeen while foregrounded, and stops when closed).
const LIVE_WINDOW = 3 * 60 * 1000;
// The portal buckets Today/Yesterday by INDIA day (users are in IST, UTC+5:30);
// the shared range is UTC-day-based, so shift the event time by +5:30 before
// comparing — that makes the comparison land on the correct India day.
const IST = 5.5 * 60 * 60 * 1000;

const PAGE_OPTIONS = [10, 100, 500, 1000];

function CustomerBox({ title, icon, accent, list, liveSet }: { title: string; icon: string; accent: string; list: Row[]; liveSet?: Set<string> }) {
  const [limit, setLimit] = useState(10);
  const shown = list.slice(0, limit);
  return (
    <div className="card custcard" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="sess-col-head">
        <h3 className="celeste" style={{ margin: 0, fontSize: 16 }}>{icon} {title}</h3>
        <span className="udet-total">{list.length}</span>
      </div>
      <div className="custlist">
        {shown.length === 0 ? <p className="drawer-muted" style={{ margin: '10px 0' }}>No customers here.</p> : shown.map((u) => (
          <div key={u.id} className="custrow">
            <div style={{ minWidth: 0 }}>
              <span className="nm">
                {liveSet?.has(u.id) && <span className="live-dot" style={{ marginRight: 6 }} />}
                {u.name || 'Unnamed'}
              </span>
              <span className="ph">{u.phone || u.id.slice(0, 10)}</span>
            </div>
            <div className="custrow-right">
              <span className="cust-wallet">{formatPaise(u.walletBalance)}</span>
              <Link href={`/users/${u.id}`} className="btn sm secondary">View</Link>
            </div>
          </div>
        ))}
      </div>
      <div className="custfoot">
        <span className="muted">Showing {Math.min(limit, list.length)} of {list.length}</span>
        <label className="muted">Rows
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

export default function CustomerManagementPage() {
  const { rows, loading } = useCollection('users');
  const { rows: presenceRows } = useCollection('presence');
  const { rows: astrologerRows } = useCollection('astrologers');
  const [search, setSearch] = useState('');
  const { preset, setPreset, custom, setCustom, range } = useCardFilter('customers', 'allTime');

  // Real-time presence: uid -> last heartbeat ms.
  const presenceMs = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of presenceRows) m.set(p.id, msOf(p.lastSeen));
    return m;
  }, [presenceRows]);

  // Astrologers are NOT customers — exclude them from every customer list.
  // (The backend now also keeps them out of `users`; this is belt-and-suspenders.)
  const astroIds = useMemo(() => new Set(astrologerRows.map((a) => a.id)), [astrologerRows]);

  // A customer's real "last active" = the most recent of their presence
  // heartbeat, any data write (recharge/consult/profile), or signup.
  const lastActive = (u: Row) => Math.max(presenceMs.get(u.id) ?? 0, msOf(u.updatedAt), msOf(u.createdAt));
  const isLiveNow = (u: Row) => (presenceMs.get(u.id) ?? 0) > Date.now() - LIVE_WINDOW;
  const inRange = (ms: number) => ms > 0 && ms + IST >= range.start && ms + IST < range.end;

  // Customers only: not deleted, not an astrologer, matching the search.
  const customers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((u) =>
      u.accountStatus !== 'deleted'
      && !astroIds.has(u.id)
      && (!q || (u.name ?? '').toLowerCase().includes(q) || (u.phone ?? '').includes(q) || u.id.includes(q)),
    );
  }, [rows, search, astroIds]);

  // LIVE is a now-metric: who is actually live right now, regardless of the date
  // filter (a customer who signed up months ago but is live today still shows).
  const live = useMemo(
    () => customers.filter(isLiveNow).sort((a, b) => (presenceMs.get(b.id) ?? 0) - (presenceMs.get(a.id) ?? 0)),
    [customers, presenceMs],
  );
  // Paid / Unpaid are scoped to customers ACTIVE in the selected period.
  const activeInRange = useMemo(() => customers.filter((u) => inRange(lastActive(u))), [customers, range.start, range.end, presenceMs]);
  const paid = useMemo(() => activeInRange.filter((u) => ((u.totalRecharge ?? 0) as number) > 0).sort((a, b) => lastActive(b) - lastActive(a)), [activeInRange]);
  const unpaid = useMemo(() => activeInRange.filter((u) => ((u.totalRecharge ?? 0) as number) === 0).sort((a, b) => lastActive(b) - lastActive(a)), [activeInRange]);

  const liveSet = useMemo(() => new Set(live.map((u) => u.id)), [live]);

  return (
    <div>
      <div className="uat-head">
        <div>
          <h1 style={{ marginBottom: 2 }}>Customer Management</h1>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Live customers right now, plus everyone active in the selected period split by paid vs unpaid ({range.label}, India time).</p>
        </div>
        <input className="input uat-search" placeholder="Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div style={{ marginTop: 12, marginBottom: 4 }}>
        <DrawerFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} />
      </div>

      {loading ? <p className="muted" style={{ marginTop: 16 }}>Loading…</p> : (
        <div className="cust3">
          <MobileSection title="Live Customers" defaultOpen={true}>
            <CustomerBox title="Live Customers" icon="🟢" accent="#3cb371" list={live} liveSet={liveSet} />
          </MobileSection>
          <MobileSection title="Paid Customers" defaultOpen={false}>
            <CustomerBox title="Paid Customers" icon="💚" accent="#2f9c63" list={paid} liveSet={liveSet} />
          </MobileSection>
          <MobileSection title="Unpaid Customers" defaultOpen={false}>
            <CustomerBox title="Unpaid Customers" icon="🤍" accent="#c9a227" list={unpaid} liveSet={liveSet} />
          </MobileSection>
        </div>
      )}
    </div>
  );
}
