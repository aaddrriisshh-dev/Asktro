'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatPaise } from '@/lib/format';
import { Range } from '@/lib/dateRange';
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
        // live active consultations (range-independent)
        const activeSnap = await getDocs(query(collection(db, 'consultations'), where('status', '==', 'active')));
        let activeChat = 0, activeVoice = 0, activeVideo = 0;
        activeSnap.forEach((doc) => {
          const t = (doc.data() as { type?: string }).type;
          if (t === 'chat') activeChat += 1;
          else if (t === 'voice') activeVoice += 1;
          else if (t === 'video') activeVideo += 1;
        });

        // history in the selected range
        const rangeSnap = await getDocs(query(
          collection(db, 'consultations'),
          where('createdAt', '>=', Timestamp.fromMillis(range.start)),
          where('createdAt', '<', Timestamp.fromMillis(range.end)),
          orderBy('createdAt', 'asc'),
        ));
        let completed = 0, cancelled2 = 0, billed = 0;
        const byDay = new Map<string, number>();
        rangeSnap.forEach((doc) => {
          const c = doc.data() as { status?: string; totalCharged?: number; createdAt?: Timestamp };
          if (c.status === 'completed') completed += 1;
          else if (c.status === 'cancelled') cancelled2 += 1;
          billed += c.totalCharged ?? 0;
          const ms = c.createdAt?.toMillis?.() ?? range.start;
          const key = new Date(ms).toISOString().slice(0, 10);
          byDay.set(key, (byDay.get(key) ?? 0) + 1);
        });
        const daily = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day: day.slice(5), value }));

        if (!cancelled) setData({
          activeNow: activeSnap.size, activeChat, activeVoice, activeVideo,
          completed, cancelled: cancelled2, totalInRange: rangeSnap.size, billedInRange: billed, daily,
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
