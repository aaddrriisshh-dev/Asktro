'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  collection, query, where, getDocs, documentId, Timestamp,
  getCountFromServer, getAggregateFromServer, sum, QueryConstraint,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatPaise, formatDate, shortDay } from '@/lib/format';
import { Range } from '@/lib/dateRange';
import { fetchDailyStats } from '@/lib/dailyStats';
import { DashCard, CardView } from './DashCard';
import { DrillGrid, DrillColumn, DrillDef } from './DrillDown';
import { DailyChart } from './DailyChart';
import { useAutoRefresh } from '@/lib/autoRefresh';

/** One live consultation row. */
interface SRow {
  id: string;
  customerId?: string;
  astrologerId?: string;
  customerName?: string;
  astrologerName?: string;
  type?: string;
  totalCharged?: number;
  billedSeconds?: number;
  createdAtMs?: number;
}

/** Resolve a set of UIDs in a collection to their `name` (batched, 30 at a time). */
async function resolveNames(path: string, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    try {
      const snap = await getDocs(query(collection(db, path), where(documentId(), 'in', chunk)));
      snap.forEach((d) => { const n = (d.data().name as string | undefined)?.trim(); if (n) m.set(d.id, n); });
    } catch { /* best-effort */ }
  }
  return m;
}

const SESSION_COLUMNS: DrillColumn<SRow>[] = [
  { header: 'Customer', cell: (s) => s.customerId
    ? <Link href={`/users/${s.customerId}`} className="ovl-nm" style={{ color: 'var(--primary)' }}>{s.customerName || s.customerId.slice(0, 12)}</Link>
    : <span className="muted">—</span> },
  { header: 'Type', cell: (s) => <span style={{ textTransform: 'capitalize' }}>{s.type || '—'}</span> },
  { header: 'Min', align: 'right', cell: (s) => Math.round(((s.billedSeconds ?? 0) / 60) * 10) / 10 },
  { header: 'Astrologer', cell: (s) => s.astrologerName || (s.astrologerId ? s.astrologerId.slice(0, 10) : '—') },
  { header: 'Charged', align: 'right', cell: (s) => formatPaise(s.totalCharged) },
  { header: 'Started', cell: (s) => formatDate(s.createdAtMs) },
];

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
  activeRows: SRow[];
}

function useConsultations(range: Range): CardView<ConsData> {
  const [data, setData] = useState<ConsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tick = useAutoRefresh();

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
        const activeRows: SRow[] = [];
        activeSnap.forEach((doc) => {
          const c = doc.data() as {
            type?: string; customerId?: string; astrologerId?: string;
            totalCharged?: number; billedSeconds?: number; createdAt?: { toMillis?: () => number };
          };
          activeRows.push({
            id: doc.id, customerId: c.customerId, astrologerId: c.astrologerId, type: c.type,
            totalCharged: c.totalCharged, billedSeconds: c.billedSeconds, createdAtMs: c.createdAt?.toMillis?.(),
          });
          if (c.type === 'chat') activeChat += 1;
          else if (c.type === 'voice') activeVoice += 1;
          else if (c.type === 'video') activeVideo += 1;
        });
        // Resolve customer + astrologer names for the live-session drill list.
        const [custNames, astroNames] = await Promise.all([
          resolveNames('users', activeRows.map((r) => r.customerId ?? '')),
          resolveNames('astrologers', activeRows.map((r) => r.astrologerId ?? '')),
        ]);
        activeRows.forEach((r) => {
          if (r.customerId) r.customerName = custNames.get(r.customerId);
          if (r.astrologerId) r.astrologerName = astroNames.get(r.astrologerId);
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
          totalInRange: totalC.data().count, billedInRange: billedAgg.data().billed ?? 0, daily, activeRows,
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.start, range.end, tick]);

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
      renderDrawer={(d) => {
        const liveDrill = (title: string, rows: SRow[]): DrillDef<SRow> =>
          ({ title, subtitle: 'Live right now', rows, columns: SESSION_COLUMNS, emptyNote: 'None active right now.' });
        return (
        <>
          <DrillGrid<SRow> tiles={[
            { color: 'c-green', label: 'Active now', value: d.activeNow.toLocaleString('en-IN'), big: true, drill: liveDrill('Active consultations', d.activeRows) },
            { color: 'c-blue', label: 'Billed (period)', value: formatPaise(d.billedInRange), big: true },
            { color: 'c-purple', label: 'Chat active', value: d.activeChat.toLocaleString('en-IN'), drill: liveDrill('Active chat consultations', d.activeRows.filter((s) => s.type === 'chat')) },
            { color: 'c-amber', label: 'Voice active', value: d.activeVoice.toLocaleString('en-IN'), drill: liveDrill('Active voice consultations', d.activeRows.filter((s) => s.type === 'voice')) },
            { color: 'c-rose', label: 'Video active', value: d.activeVideo.toLocaleString('en-IN'), drill: liveDrill('Active video consultations', d.activeRows.filter((s) => s.type === 'video')) },
            { color: 'c-gold', label: 'Completed (period)', value: d.completed.toLocaleString('en-IN'), href: '/chat-sessions' },
          ]} />
          <h3 style={{ margin: '4px 0 10px' }}>Consultations started per day</h3>
          <div className="drawer-chart">
            <DailyChart data={d.daily} color="#2f9c63" name="Consultations" />
          </div>
        </>
        );
      }}
    />
  );
}
