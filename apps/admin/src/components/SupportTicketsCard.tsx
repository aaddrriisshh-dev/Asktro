'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Range } from '@/lib/dateRange';
import { DashCard, CardView } from './DashCard';
import { Metric } from './Metric';
import { DailyChart } from './DailyChart';

interface TicketData {
  open: number;
  closed: number;
  total: number;
  fromCustomers: number;
  fromAstrologers: number;
  highPriority: number;
  daily: { day: string; value: number }[];
}

function useTickets(range: Range): CardView<TicketData> {
  const [data, setData] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'supportTickets'),
          where('createdAt', '>=', Timestamp.fromMillis(range.start)),
          where('createdAt', '<', Timestamp.fromMillis(range.end)),
          orderBy('createdAt', 'asc'),
        ));
        let open = 0, closed = 0, fromCustomers = 0, fromAstrologers = 0, highPriority = 0;
        const byDay = new Map<string, number>();
        snap.forEach((doc) => {
          const t = doc.data() as { status?: string; customerId?: string | null; astrologerId?: string | null; priority?: string; createdAt?: Timestamp };
          if (t.status === 'open') open += 1;
          else if (t.status === 'closed') closed += 1;
          if (t.customerId) fromCustomers += 1;
          if (t.astrologerId) fromAstrologers += 1;
          if (t.priority === 'high') highPriority += 1;
          const ms = t.createdAt?.toMillis?.() ?? range.start;
          const key = new Date(ms).toISOString().slice(0, 10);
          byDay.set(key, (byDay.get(key) ?? 0) + 1);
        });
        const daily = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day: day.slice(5), value }));
        if (!cancelled) setData({ open, closed, total: snap.size, fromCustomers, fromAstrologers, highPriority, daily });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.start, range.end]);

  return { loading, error, value: (data?.open ?? 0).toLocaleString('en-IN'), pill: data ? `${data.total} total` : undefined, data };
}

const ticketIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

export function SupportTicketsCard() {
  return (
    <DashCard<TicketData>
      cardKey="support"
      defaultPreset="allTime"
      accentClass="c-red"
      accent="#e0564a"
      icon={ticketIcon}
      title="Open Support Tickets"
      decor="decor-tr"
      useData={useTickets}
      renderDrawer={(d) => (
        <>
          <div className="metricgrid">
            <Metric color="c-red" label="Open" value={d.open.toLocaleString('en-IN')} big />
            <Metric color="c-green" label="Closed" value={d.closed.toLocaleString('en-IN')} big />
            <Metric color="c-blue" label="Total" value={d.total.toLocaleString('en-IN')} />
            <Metric color="c-purple" label="From customers" value={d.fromCustomers.toLocaleString('en-IN')} />
            <Metric color="c-amber" label="From astrologers" value={d.fromAstrologers.toLocaleString('en-IN')} />
            <Metric color="c-rose" label="High priority" value={d.highPriority.toLocaleString('en-IN')} />
          </div>
          <h3 style={{ margin: '4px 0 10px' }}>Tickets raised per day</h3>
          <div className="drawer-chart">
            <DailyChart data={d.daily} color="#e0564a" name="Tickets" />
          </div>
        </>
      )}
    />
  );
}
