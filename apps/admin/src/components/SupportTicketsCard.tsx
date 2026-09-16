'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, query, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { shortDay } from '@/lib/format';
import { Range } from '@/lib/dateRange';
import { DashCard, CardView } from './DashCard';
import { DailyChart } from './DailyChart';
import { SupportTicketList, TicketRow } from './SupportTicketList';

interface TicketData {
  open: number;
  closed: number;
  total: number;
  fromCustomers: number;
  fromAstrologers: number;
  highPriority: number;
  daily: { day: string; value: number }[];
  tickets: TicketRow[];
}

interface TicketDoc {
  status?: string; customerId?: string | null; astrologerId?: string | null; priority?: string;
  createdAt?: Timestamp; ticketNo?: string; subject?: string; message?: string; body?: string; userName?: string;
  portalUnread?: boolean;
  thread?: { by?: string; text?: string; at?: Timestamp }[];
}

function useTickets(range: Range): CardView<TicketData> {
  // Live subscription to ALL tickets (range-independent). The headline number
  // for "Open Support Tickets" must reflect what is actually open RIGHT NOW —
  // an actionable ops figure — not how many happened to be opened inside the
  // selected date window (which made the tile read 0 when a ticket was open).
  // The date filter still shapes the drawer's "tickets per day" chart.
  const [all, setAll] = useState<TicketRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'supportTickets'), orderBy('createdAt', 'desc')),
      (snap) => {
        const list: TicketRow[] = snap.docs.map((doc) => {
          const t = doc.data() as TicketDoc;
          const ms = t.createdAt?.toMillis?.() ?? Date.now();
          const role: 'customer' | 'astrologer' = t.astrologerId ? 'astrologer' : 'customer';
          return {
            id: doc.id,
            ticketNo: t.ticketNo ?? `#${doc.id.slice(0, 6).toUpperCase()}`,
            subject: t.subject ?? 'Support request',
            // Customer app writes the body to `body`; astrologer path mirrors to `message`.
            message: t.message ?? t.body ?? '',
            status: t.status ?? 'open',
            who: t.userName ?? (t.customerId || t.astrologerId || 'Unknown').slice(0, 10),
            role,
            priority: t.priority ?? 'normal',
            createdMs: ms,
            portalUnread: t.portalUnread === true,
            thread: (t.thread ?? []).map((m) => ({ by: m.by ?? 'admin', text: m.text ?? '', atMs: m.at?.toMillis?.() ?? ms })),
          };
        });
        setAll(list);
        setError(null);
      },
      (e) => setError(e.message),
    );
    return () => unsub();
  }, []);

  const data = useMemo<TicketData | null>(() => {
    if (!all) return null;
    let open = 0, closed = 0, fromCustomers = 0, fromAstrologers = 0, highPriority = 0;
    const byDay = new Map<string, number>();
    for (const t of all) {
      if (t.status === 'open') open += 1;
      else if (t.status === 'closed') closed += 1;
      if (t.role === 'customer') fromCustomers += 1;
      else fromAstrologers += 1;
      if (t.priority === 'high') highPriority += 1;
      // Only the per-day chart respects the selected date range.
      if (t.createdMs >= range.start && t.createdMs < range.end) {
        const key = new Date(t.createdMs).toISOString().slice(0, 10);
        byDay.set(key, (byDay.get(key) ?? 0) + 1);
      }
    }
    const daily = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day: shortDay(day), value }));
    const tickets = [...all].sort((a, b) => b.createdMs - a.createdMs);
    return { open, closed, total: all.length, fromCustomers, fromAstrologers, highPriority, daily, tickets };
  }, [all, range.start, range.end]);

  return {
    loading: all === null && !error,
    error,
    value: (data?.open ?? 0).toLocaleString('en-IN'),
    pill: data ? `${data.total} total` : undefined,
    data,
  };
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
          <SupportTicketList tickets={d.tickets} />

          <h3 style={{ margin: '20px 0 10px' }}>Tickets raised per day</h3>
          <div className="drawer-chart">
            <DailyChart data={d.daily} color="#e0564a" name="Tickets" />
          </div>
        </>
      )}
    />
  );
}
