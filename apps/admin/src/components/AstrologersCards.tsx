'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Range } from '@/lib/dateRange';
import { DashCard, CardView } from './DashCard';
import { Metric } from './Metric';
import { BarBreakdown } from './BarBreakdown';

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
        const snap = await getDocs(collection(db, 'astrologers'));
        let online = 0, available = 0, verified = 0, featured = 0, approved = 0, pending = 0;
        let male = 0, female = 0, ratingSum = 0, ratingCount = 0, newInPeriod = 0;
        snap.forEach((doc) => {
          const a = doc.data() as {
            onlineStatus?: boolean; available?: boolean; verified?: boolean; featured?: boolean;
            accountStatus?: string; gender?: string; rating?: number; createdAt?: { toMillis?: () => number };
          };
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
          avgRating: ratingCount ? Number((ratingSum / ratingCount).toFixed(2)) : 0, newInPeriod,
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
          <div className="metricgrid">
            <Metric color="c-teal" label="Online now" value={d.online.toLocaleString('en-IN')} big />
            <Metric color="c-green" label="Available" value={d.available.toLocaleString('en-IN')} big />
            <Metric color="c-slate" label="Offline" value={d.offline.toLocaleString('en-IN')} />
            <Metric color="c-blue" label="Verified" value={d.verified.toLocaleString('en-IN')} />
            <Metric color="c-gold" label="Featured" value={d.featured.toLocaleString('en-IN')} />
            <Metric color="c-amber" label="Avg rating" value={d.avgRating ? `${d.avgRating} ★` : '—'} />
          </div>
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
          <div className="metricgrid">
            <Metric color="c-indigo" label="Total" value={d.total.toLocaleString('en-IN')} big />
            <Metric color="c-teal" label="Online" value={d.online.toLocaleString('en-IN')} big />
            <Metric color="c-purple" label="Male" value={d.male.toLocaleString('en-IN')} />
            <Metric color="c-rose" label="Female" value={d.female.toLocaleString('en-IN')} />
            <Metric color="c-green" label="Approved" value={d.approved.toLocaleString('en-IN')} />
            <Metric color="c-amber" label="Pending" value={d.pending.toLocaleString('en-IN')} />
          </div>
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
