'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Range } from '@/lib/dateRange';
import { DashCard, CardView } from './DashCard';
import { DrillGrid, DrillColumn, DrillDef } from './DrillDown';
import { BarBreakdown } from './BarBreakdown';

/** One astrologer row backing the drill-down lists. */
interface ARow {
  id: string;
  name?: string;
  phone?: string;
  onlineStatus?: boolean;
  available?: boolean;
  verified?: boolean;
  featured?: boolean;
  accountStatus?: string;
  gender?: string;
  rating?: number;
}

const dot = (label: string, color: string) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: 'inline-block' }} />{label}
  </span>
);

const ASTRO_COLUMNS: DrillColumn<ARow>[] = [
  { header: 'Astrologer', cell: (a) => (
    <div style={{ minWidth: 0 }}>
      <span className="ovl-nm">{a.name || 'Unnamed'}</span>
      <span className="ovl-ph">{a.phone || a.id.slice(0, 12)}</span>
    </div>
  ) },
  { header: 'Status', cell: (a) => a.onlineStatus ? dot('Online', '#2f9c63') : dot('Offline', '#c9c4e0') },
  { header: 'Rating', align: 'right', cell: (a) => (a.rating ? `${a.rating} ★` : '—') },
  { header: 'Verified', cell: (a) => a.verified ? '✓' : <span className="muted">—</span> },
  { header: 'Account', cell: (a) => a.accountStatus === 'pending'
    ? <span className="pay-pill free">Pending</span>
    : <span className="pay-pill paid">Approved</span> },
  { header: '', align: 'right', cell: (a) => <Link href={`/astrologers/${a.id}`} className="btn sm secondary">View</Link> },
];

interface AstroData {
  total: number;
  online: number;
  available: number;
  offline: number;
  verified: number;
  featured: number;
  approved: number;
  pending: number;
  male: number;
  female: number;
  avgRating: number;
  newInPeriod: number;
  rows: ARow[];
}

/** Shared roster fetch — both astrologer cards read the same snapshot. */
function useAstrologers(range: Range): CardView<AstroData> {
  const [data, setData] = useState<AstroData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'astrologers'), limit(500)));
        let online = 0, available = 0, verified = 0, featured = 0, approved = 0, pending = 0;
        let male = 0, female = 0, ratingSum = 0, ratingCount = 0, newInPeriod = 0;
        const rows: ARow[] = [];
        snap.forEach((doc) => {
          const a = doc.data() as {
            name?: string; phone?: string;
            onlineStatus?: boolean; available?: boolean; verified?: boolean; featured?: boolean;
            accountStatus?: string; gender?: string; rating?: number; createdAt?: { toMillis?: () => number };
          };
          rows.push({
            id: doc.id, name: a.name, phone: a.phone, onlineStatus: a.onlineStatus, available: a.available,
            verified: a.verified, featured: a.featured, accountStatus: a.accountStatus, gender: a.gender, rating: a.rating,
          });
          if (a.onlineStatus) online += 1;
          if (a.available) available += 1;
          if (a.verified) verified += 1;
          if (a.featured) featured += 1;
          if (a.accountStatus === 'pending') pending += 1;
          else approved += 1;
          if (a.gender === 'male') male += 1;
          else if (a.gender === 'female') female += 1;
          if (typeof a.rating === 'number' && a.rating > 0) { ratingSum += a.rating; ratingCount += 1; }
          const ms = a.createdAt?.toMillis?.() ?? 0;
          if (ms >= range.start && ms < range.end) newInPeriod += 1;
        });
        if (!cancelled) setData({
          total: snap.size, online, available, offline: snap.size - online, verified, featured,
          approved, pending, male, female,
          avgRating: ratingCount ? Number((ratingSum / ratingCount).toFixed(2)) : 0, newInPeriod, rows,
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.start, range.end]);

  return { loading, error, value: '', data };
}

const starIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

const inr = (n: number) => n.toLocaleString('en-IN');
const astroDrill = (title: string, rows: ARow[]): DrillDef<ARow> =>
  ({ title, rows, columns: ASTRO_COLUMNS, emptyNote: 'None here.' });

// ---- Card 5: Active (online) astrologers ---------------------------------
export function ActiveAstrologersCard() {
  return (
    <DashCard<AstroData>
      cardKey="astro_active"
      defaultPreset="allTime"
      accentClass="c-teal"
      accent="#12a594"
      icon={starIcon}
      title="Active Astrologers"
      decor="decor-tr"
      useData={(range) => {
        const v = useAstrologers(range);
        return { ...v, value: (v.data?.online ?? 0).toLocaleString('en-IN'), pill: 'online now' };
      }}
      renderDrawer={(d) => (
        <>
          <DrillGrid<ARow> tiles={[
            { color: 'c-teal', label: 'Online now', value: inr(d.online), big: true, drill: astroDrill('Online astrologers', d.rows.filter((a) => a.onlineStatus)) },
            { color: 'c-green', label: 'Available', value: inr(d.available), big: true, drill: astroDrill('Available astrologers', d.rows.filter((a) => a.available)) },
            { color: 'c-slate', label: 'Offline', value: inr(d.offline), drill: astroDrill('Offline astrologers', d.rows.filter((a) => !a.onlineStatus)) },
            { color: 'c-blue', label: 'Verified', value: inr(d.verified), drill: astroDrill('Verified astrologers', d.rows.filter((a) => a.verified)) },
            { color: 'c-gold', label: 'Featured', value: inr(d.featured), drill: astroDrill('Featured astrologers', d.rows.filter((a) => a.featured)) },
            { color: 'c-amber', label: 'Avg rating', value: d.avgRating ? `${d.avgRating} ★` : '—' },
          ]} />
          <h3 style={{ margin: '4px 0 12px' }}>Availability</h3>
          <BarBreakdown segments={[
            { label: 'Online', value: d.online, color: '#12a594' },
            { label: 'Offline', value: d.offline, color: '#c9c4e0' },
          ]} />
        </>
      )}
    />
  );
}

// ---- Card 6: Total astrologers (gender split) ----------------------------
export function TotalAstrologersCard() {
  return (
    <DashCard<AstroData>
      cardKey="astro_total"
      defaultPreset="allTime"
      accentClass="c-indigo"
      accent="#5b5bd6"
      icon={starIcon}
      title="Total Astrologers"
      decor="decor-tl"
      useData={(range) => {
        const v = useAstrologers(range);
        return { ...v, value: (v.data?.total ?? 0).toLocaleString('en-IN'), pill: v.data ? `${v.data.online} online` : undefined };
      }}
      renderDrawer={(d) => (
        <>
          <DrillGrid<ARow> tiles={[
            { color: 'c-indigo', label: 'Total', value: inr(d.total), big: true, drill: astroDrill('All astrologers', d.rows) },
            { color: 'c-teal', label: 'Online', value: inr(d.online), big: true, drill: astroDrill('Online astrologers', d.rows.filter((a) => a.onlineStatus)) },
            { color: 'c-purple', label: 'Male', value: inr(d.male), drill: astroDrill('Male astrologers', d.rows.filter((a) => a.gender === 'male')) },
            { color: 'c-rose', label: 'Female', value: inr(d.female), drill: astroDrill('Female astrologers', d.rows.filter((a) => a.gender === 'female')) },
            { color: 'c-green', label: 'Approved', value: inr(d.approved), drill: astroDrill('Approved astrologers', d.rows.filter((a) => a.accountStatus !== 'pending')) },
            { color: 'c-amber', label: 'Pending', value: inr(d.pending), drill: astroDrill('Astrologers awaiting approval', d.rows.filter((a) => a.accountStatus === 'pending')) },
          ]} />
          <h3 style={{ margin: '4px 0 12px' }}>Gender split</h3>
          <BarBreakdown segments={[
            { label: 'Male', value: d.male, color: '#5b5bd6' },
            { label: 'Female', value: d.female, color: '#d0567e' },
          ]} />
        </>
      )}
    />
  );
}
