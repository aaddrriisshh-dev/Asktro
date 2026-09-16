'use client';

import { useMemo } from 'react';
import { useCollection } from '@/lib/hooks';
import { SupportTicketList, TicketRow } from '@/components/SupportTicketList';

/**
 * Support console (standalone page). Renders the SAME live reply/close/reopen
 * console used in the dashboard's Support card — reading a ticket's full thread,
 * replying to the user (which notifies them + writes an audit entry via the
 * replySupportTicket callable), and closing/reopening. Money never moves here by
 * design; refunds are handled from Customer Management.
 */
export default function SupportPage() {
  const { rows, loading } = useCollection('supportTickets');

  const tickets = useMemo<TicketRow[]>(() => {
    return rows
      .map((t): TicketRow => {
        const ms = t.createdAt?.toMillis?.() ?? Date.now();
        const role: 'customer' | 'astrologer' = t.astrologerId ? 'astrologer' : 'customer';
        return {
          id: t.id,
          ticketNo: t.ticketNo ?? `#${t.id.slice(0, 6).toUpperCase()}`,
          subject: t.subject ?? 'Support request',
          // Customer app writes the body to `body`; astrologer path mirrors to `message`.
          message: t.message ?? t.body ?? '',
          status: t.status ?? 'open',
          who: t.userName ?? (t.customerId || t.astrologerId || 'Unknown').slice(0, 10),
          role,
          priority: t.priority ?? 'normal',
          createdMs: ms,
          portalUnread: t.portalUnread === true,
          thread: (t.thread ?? []).map((m: { by?: string; text?: string; at?: { toMillis?: () => number } }) => ({
            by: m.by ?? 'admin',
            text: m.text ?? '',
            atMs: m.at?.toMillis?.() ?? ms,
          })),
        };
      })
      .sort((a, b) => b.createdMs - a.createdMs);
  }, [rows]);

  return (
    <div>
      <h1>Support</h1>
      {loading ? (
        <div className="card"><p className="muted">Loading…</p></div>
      ) : tickets.length === 0 ? (
        <div className="card"><p className="muted">No support tickets.</p></div>
      ) : (
        <SupportTicketList tickets={tickets} />
      )}
    </div>
  );
}
