'use client';

import { ReactNode, useMemo, useState } from 'react';
import { useCollection, Row } from '@/lib/hooks';
import { Preset } from '@/lib/dateRange';
import { DrawerFilter } from '@/components/DrawerFilter';
import { useCardFilter } from '@/lib/useCardFilter';
import { PanelProvider, usePanels } from '@/lib/panels';
import { Panel } from '@/components/Panel';
import { DrillGrid, DrillTile } from '@/components/DrillDown';
import { URow, USER_COLUMNS } from '@/components/PaidUnpaidCards';

// "Live" = a real presence heartbeat within the last few minutes (the customer
// app writes presence/{uid}.lastSeen while foregrounded).
const LIVE_WINDOW = 3 * 60 * 1000;
const IST = 5.5 * 60 * 60 * 1000;
const DAY = 86_400_000;
const msOf = (t: { toMillis?: () => number } | undefined) => t?.toMillis?.() ?? 0;

// Most recent India (IST) midnight at-or-before `ms`, in real UTC ms. Buckets by
// the India day the founder lives in, so "Today" matches his calendar.
function istDayStart(ms: number): number {
  const d = new Date(ms + IST);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST;
}

// India-day ranges in real UTC ms, compared directly against event ms.
function resolveIndiaRange(preset: Preset, custom?: { start?: string; end?: string }): { start: number; end: number; label: string } {
  const now = Date.now();
  const t0 = istDayStart(now);
  const dIst = new Date(now + IST);
  switch (preset) {
    case 'today': return { start: t0, end: t0 + DAY, label: 'Today' };
    case 'yesterday': return { start: t0 - DAY, end: t0, label: 'Yesterday' };
    case 'last7': return { start: t0 - 6 * DAY, end: t0 + DAY, label: 'Last 7 Days' };
    case 'last30': return { start: t0 - 29 * DAY, end: t0 + DAY, label: 'Last 30 Days' };
    case 'thisMonth': return {
      start: Date.UTC(dIst.getUTCFullYear(), dIst.getUTCMonth(), 1) - IST,
      end: Date.UTC(dIst.getUTCFullYear(), dIst.getUTCMonth() + 1, 1) - IST, label: 'This Month',
    };
    case 'prevMonth': return {
      start: Date.UTC(dIst.getUTCFullYear(), dIst.getUTCMonth() - 1, 1) - IST,
      end: Date.UTC(dIst.getUTCFullYear(), dIst.getUTCMonth(), 1) - IST, label: 'Previous Month',
    };
    case 'allTime': return { start: 0, end: t0 + DAY, label: 'All Time' };
    case 'custom': {
      const s = custom?.start ? new Date(custom.start).getTime() : t0;
      const e = custom?.end ? new Date(custom.end).getTime() : t0 + DAY;
      return { start: s, end: e > s ? e : s + DAY, label: 'Custom' };
    }
  }
}

const inr = (n: number) => n.toLocaleString('en-IN');
// Search a customer row by name / phone / email / id (q already lowercased).
const searchURow = (u: URow, q: string) =>
  (u.name ?? '').toLowerCase().includes(q) || (u.phone ?? '').includes(q)
  || (u.email ?? '').toLowerCase().includes(q) || u.id.toLowerCase().includes(q);

const expandIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 3h7v7M21 3l-8 8" /><path d="M10 21H3v-7M3 21l8-8" />
  </svg>
);
const peopleIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

/** A dashboard-style stat tile that opens a Panel with drill-down sub-tiles. */
function TileCard({ id, title, accent, accentClass, big, value, pill, children }: {
  id: string; title: string; accent: string; accentClass: string; big?: boolean;
  value: string; pill?: string; children: ReactNode;
}) {
  const { openPanel } = usePanels();
  return (
    <>
      <div className={`stat dashcard ${accentClass}${big ? ' custtile--big' : ''}`} onClick={() => openPanel(id)} role="button" tabIndex={0}>
        <button className="dashcard__expand" onClick={(e) => { e.stopPropagation(); openPanel(id); }} aria-label={`Open ${title}`}>{expandIcon}</button>
        <div className="stat__label"><span className="stat__icon">{peopleIcon}</span>{title}</div>
        <div className="stat__value">{value}</div>
        <div className="stat__foot">{pill && <span className="stat__pill">{pill}</span>}</div>
      </div>
      <Panel id={id} title={title} accent={accent}>{children}</Panel>
    </>
  );
}

function CustomerManagement() {
  const { rows: users, loading } = useCollection('users');
  const { rows: presenceRows } = useCollection('presence');
  const { rows: astrologerRows } = useCollection('astrologers');
  const { preset, setPreset, custom, setCustom } = useCardFilter('customers', 'allTime');
  const range = useMemo(() => resolveIndiaRange(preset, custom), [preset, custom]);

  const presenceMs = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of presenceRows) m.set(p.id, msOf(p.lastSeen));
    return m;
  }, [presenceRows]);
  const astroIds = useMemo(() => new Set(astrologerRows.map((a) => a.id)), [astrologerRows]);

  const toRow = (u: Row): URow => ({
    id: u.id, name: u.name, phone: u.phone, email: u.email, gender: u.gender,
    accountStatus: u.accountStatus, walletBalance: u.walletBalance, totalRecharge: u.totalRecharge,
    createdAt: msOf(u.createdAt), // real signup date for the "Joined" column
  });

  // Everything below is computed from the LIVE users collection, scoped to the
  // selected India-day range. "In period" = last active in range (heartbeat, any
  // write, or signup) — so Today/Yesterday/custom each show real, correct sets.
  const slices = useMemo(() => {
    const lastActive = (u: Row) => Math.max(presenceMs.get(u.id) ?? 0, msOf(u.updatedAt), msOf(u.createdAt));
    const isLive = (u: Row) => (presenceMs.get(u.id) ?? 0) > Date.now() - LIVE_WINDOW;
    const inRange = (ms: number) => ms > 0 && ms >= range.start && ms < range.end;
    // A COMPLETE customer has the same essentials the app gate requires: a real
    // name (not "Guest"), a date of birth, and a birth place with coordinates.
    // Incomplete = signed in but abandoned setup — kept OUT of the real-customer
    // buckets so counts aren't polluted, and shown in their own "Incomplete" list.
    const isComplete = (u: Row) => {
      const name = String(u.name ?? '').trim().toLowerCase();
      return name.length > 0 && name !== 'guest' && u.birthDateMs != null && u.birthLat != null && u.birthLng != null;
    };

    const everyone = users.filter((u) => u.accountStatus !== 'deleted' && !astroIds.has(u.id));
    const customers = everyone.filter(isComplete);
    const incompleteActive = everyone
      .filter((u) => !isComplete(u) && inRange(lastActive(u)))
      .sort((a, b) => lastActive(b) - lastActive(a));
    const active = customers
      .filter((u) => inRange(lastActive(u)))
      .sort((a, b) => lastActive(b) - lastActive(a));
    const live = customers.filter(isLive).sort((a, b) => (presenceMs.get(b.id) ?? 0) - (presenceMs.get(a.id) ?? 0));

    const R = (list: Row[]) => list.map(toRow);
    const paid = active.filter((u) => (u.totalRecharge ?? 0) > 0);
    const unpaid = active.filter((u) => (u.totalRecharge ?? 0) === 0);
    return {
      all: R(active),
      live: R(live), livePaid: R(live.filter((u) => (u.totalRecharge ?? 0) > 0)), liveUnpaid: R(live.filter((u) => (u.totalRecharge ?? 0) === 0)),
      paid: R(paid), paidEmail: R(paid.filter((u) => u.email)), paidPhone: R(paid.filter((u) => u.phone)),
      paidMale: R(paid.filter((u) => u.gender === 'male')), paidFemale: R(paid.filter((u) => u.gender === 'female')),
      unpaid: R(unpaid), unpaidEmail: R(unpaid.filter((u) => u.email)), unpaidPhone: R(unpaid.filter((u) => u.phone)),
      unpaidBlocked: R(unpaid.filter((u) => u.accountStatus === 'blocked')),
      male: R(active.filter((u) => u.gender === 'male')), female: R(active.filter((u) => u.gender === 'female')),
      withEmail: R(active.filter((u) => u.email)), withPhone: R(active.filter((u) => u.phone)),
      blocked: R(active.filter((u) => u.accountStatus === 'blocked')),
      incomplete: R(incompleteActive),
    };
  }, [users, astroIds, presenceMs, range.start, range.end]);

  const sub = `${range.label} · India time`;
  const def = (title: string, rows: URow[], emptyNote: string) => ({ title, subtitle: sub, rows, columns: USER_COLUMNS, emptyNote, search: searchURow });

  return (
    <div>
      <div className="uat-head">
        <div>
          <h1 style={{ marginBottom: 2 }}>Customer Management</h1>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Every customer, live — tap a tile to drill into the exact list ({range.label}, India time).
          </p>
        </div>
      </div>

      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <DrawerFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} />
      </div>

      {loading ? <p className="muted" style={{ marginTop: 16 }}>Loading…</p> : (
        <div className="custtiles">
          <TileCard id="cust_all" title="All Customers" accent="#3b6fd4" accentClass="c-blue" big
            value={inr(slices.all.length)} pill={`${slices.live.length} live now`}>
            <DrillGrid<URow> tiles={[
              { color: 'c-blue', label: 'All customers', value: inr(slices.all.length), big: true, drill: def('All customers', slices.all, 'None active in this period.') },
              { color: 'c-green', label: 'Paid', value: inr(slices.paid.length), big: true, drill: def('Paid customers', slices.paid, 'No paid customers in this period.') },
              { color: 'c-slate', label: 'Unpaid', value: inr(slices.unpaid.length), drill: def('Unpaid customers', slices.unpaid, 'No unpaid customers in this period.') },
              { color: 'c-teal', label: 'Live now', value: inr(slices.live.length), drill: def('Live customers', slices.live, 'Nobody live right now.') },
              { color: 'c-purple', label: 'Male', value: inr(slices.male.length), drill: def('Male customers', slices.male, 'None here.') },
              { color: 'c-rose', label: 'Female', value: inr(slices.female.length), drill: def('Female customers', slices.female, 'None here.') },
              { color: 'c-amber', label: 'With email', value: inr(slices.withEmail.length), drill: def('Customers with an email', slices.withEmail, 'None here.') },
              { color: 'c-gold', label: 'With phone', value: inr(slices.withPhone.length), drill: def('Customers with a phone', slices.withPhone, 'None here.') },
              { color: 'c-red', label: 'Blocked', value: inr(slices.blocked.length), drill: def('Blocked customers', slices.blocked, 'None blocked.') },
              { color: 'c-slate', label: 'Incomplete signups', value: inr(slices.incomplete.length), drill: def('Incomplete signups (abandoned setup)', slices.incomplete, 'No incomplete signups.') },
            ]} />
          </TileCard>

          <div className="custtiles__squares">
            <TileCard id="cust_live" title="Live Customers" accent="#3cb371" accentClass="c-green"
              value={inr(slices.live.length)} pill="live now">
              <DrillGrid<URow> tiles={[
                { color: 'c-teal', label: 'Live now', value: inr(slices.live.length), big: true, drill: def('Live customers', slices.live, 'Nobody live right now.') },
                { color: 'c-green', label: 'Live · paid', value: inr(slices.livePaid.length), drill: def('Live paid customers', slices.livePaid, 'None.') },
                { color: 'c-slate', label: 'Live · unpaid', value: inr(slices.liveUnpaid.length), drill: def('Live unpaid customers', slices.liveUnpaid, 'None.') },
              ]} />
            </TileCard>

            <TileCard id="cust_paid" title="Paid Customers" accent="#2f9c63" accentClass="c-green"
              value={inr(slices.paid.length)} pill={`${slices.all.length ? Math.round((slices.paid.length / slices.all.length) * 100) : 0}% of active`}>
              <DrillGrid<URow> tiles={[
                { color: 'c-green', label: 'Paid customers', value: inr(slices.paid.length), big: true, drill: def('Paid customers', slices.paid, 'No paid customers in this period.') },
                { color: 'c-amber', label: 'Reachable (email)', value: inr(slices.paidEmail.length), drill: def('Paid · reachable by email', slices.paidEmail, 'None.') },
                { color: 'c-gold', label: 'Reachable (phone)', value: inr(slices.paidPhone.length), drill: def('Paid · reachable by phone', slices.paidPhone, 'None.') },
                { color: 'c-purple', label: 'Male', value: inr(slices.paidMale.length), drill: def('Paid male customers', slices.paidMale, 'None.') },
                { color: 'c-rose', label: 'Female', value: inr(slices.paidFemale.length), drill: def('Paid female customers', slices.paidFemale, 'None.') },
              ]} />
            </TileCard>

            <TileCard id="cust_unpaid" title="Unpaid Customers" accent="#64748b" accentClass="c-slate"
              value={inr(slices.unpaid.length)} pill={`${slices.all.length ? Math.round((slices.unpaid.length / slices.all.length) * 100) : 0}% of active`}>
              <DrillGrid<URow> tiles={[
                { color: 'c-slate', label: 'Unpaid customers', value: inr(slices.unpaid.length), big: true, drill: def('Unpaid customers', slices.unpaid, 'No unpaid customers in this period.') },
                { color: 'c-green', label: 'Reachable (email)', value: inr(slices.unpaidEmail.length), drill: def('Unpaid · reachable by email', slices.unpaidEmail, 'None.') },
                { color: 'c-amber', label: 'Reachable (phone)', value: inr(slices.unpaidPhone.length), drill: def('Unpaid · reachable by phone', slices.unpaidPhone, 'None.') },
                { color: 'c-red', label: 'Blocked', value: inr(slices.unpaidBlocked.length), drill: def('Blocked unpaid customers', slices.unpaidBlocked, 'None blocked.') },
              ]} />
            </TileCard>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomerManagementPage() {
  return (
    <PanelProvider>
      <CustomerManagement />
    </PanelProvider>
  );
}
