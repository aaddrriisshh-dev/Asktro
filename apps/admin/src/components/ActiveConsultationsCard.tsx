'use client';

import { useEffect, useState } from 'react';
import {
  collection, query, where, getDocs, Timestamp,
  getCountFromServer, getAggregateFromServer, sum, QueryConstraint,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatPaise, shortDay } from '@/lib/format';
import { Range } from '@/lib/dateRange';
import { fetchDailyStats } from '@/lib/dailyStats';
import { DashCard, CardView } from './DashCard';
import { Metric } from './Metric';
import { DailyChart } from './DailyChart';

interface ConsData {
  activeNow: number;
  activeChat: number;
  activeVoice: number;
  activeVideo: number;
  completed: number;
  cancelled: number;
  totalInRange: number;
  billedInRange: number; // paise
  daily: { day: string; value: number }[];
}

function useConsultations(range: Range): CardView<ConsData> {
  const [data, setData] = useState<ConsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Live active consultations — bounded by concurrency (a handful), so a
        // direct read is fine and gives the per-type split.
        const activeSnap = await getDocs(query(collection(db, 'consultations'), where('status', '==', 'active')));
        let activeChat = 0, activeVoice = 0, activeVideo = 0;
        activeSnap.forEach((doc) => {
          const t = (doc.data() as { type?: string }).type;
          if (t === 'chat') activeChat += 1;
          else if (t === 'voice') activeVoice += 1;
          else if (t === 'video') activeVideo += 1;
        });

        // History in the range WITHOUT downloading the consultations: counts and
        // the billed sum are server-side aggregations; the daily "started per
        // day" histogram comes from the per-day rollup. Nothing unbounded loads.
        const start = Timestamp.fromMillis(range.start);
        const end = Timestamp.fromMillis(range.end);
        const inRange = (extra: QueryConstraint[]) =>
          query(collection(db, 'consultations'), where('createdAt', '>=', start), where('createdAt', '<', end), ...extra);
        const [completedC, cancelledC, totalC, billedAgg, days] = await Promise.all([
          getCountFromServer(inRange([where('status', '==', 'completed')])),
          getCountFromServer(inRange([where('status', '==', 'cancelled')])),
          getCountFromServer(inRange([])),
          getAggregateFromServer(inRange([]), { billed: sum('totalCharged') }),
          fetchDailyStats(range),
        ]);
        const daily = days.map((s) => ({
          day: shortDay(s.day),
          value: (s.consultations?.chat ?? 0) + (s.consultations?.voice ?? 0) + (s.consultations?.video ?? 0),
        }));

        if (!cancelled) setData({
          activeNow: activeSnap.size, activeChat, activeVoice, activeVideo,
          completed: completedC.data().count, cancelled: cancelledC.data().count,
          totalInRange: totalC.data().count, billedInRange: billedAgg.data().billed ?? 0, daily,
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.start, range.end]);

  return { loading, error, value: (data?.activeNow ?? 0).toLocaleString('en-IN'), pill: 'live now', data };
}

const consIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export function ActiveConsultationsCard() {
  return (
    <DashCard<ConsData>
      cardKey="consultations"
      defaultPreset="allTime"
      accentClass="c-green"
      accent="#2f9c63"
      icon={consIcon}
      title="Active Consultations"
      decor="decor-br"
      useData={useConsultations}
      renderDrawer={(d) => (
        <>
          <div className="metricgrid">
            <Metric color="c-green" label="Active now" value={d.activeNow.toLocaleString('en-IN')} big />
            <Metric color="c-blue" label="Billed (period)" value={formatPaise(d.billedInRange)} big />
            <Metric color="c-purple" label="Chat active" value={d.activeChat.toLocaleString('en-IN')} />
            <Metric color="c-amber" label="Voice active" value={d.activeVoice.toLocaleString('en-IN')} />
            <Metric color="c-rose" label="Video active" value={d.activeVideo.toLocaleString('en-IN')} />
            <Metric color="c-gold" label="Completed (period)" value={d.completed.toLocaleString('en-IN')} />
          </div>
          <h3 style={{ margin: '4px 0 10px' }}>Consultations started per day</h3>
          <div className="drawer-chart">
            <DailyChart data={d.daily} color="#2f9c63" name="Consultations" />
          </div>
        </>
      )}
    />
  );
}
