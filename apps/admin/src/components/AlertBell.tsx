'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Portal alert bell — a persistent, fixed top-right control on EVERY dashboard
 * page so support tickets, new customer replies, pending payouts and astrologer
 * approvals never get skipped just because nobody opened the dashboard. Counts
 * come from cheap server-side COUNT aggregations (no docs downloaded) refreshed
 * on a timer and whenever the panel is opened.
 */
interface Counts {
  tickets: number; // open support tickets (includes ones with a new reply)
  replies: number; // tickets with an unread customer reply (portalUnread)
  payouts: number; // pending astrologer payouts
  approvals: number; // astrologers awaiting verification
}

export function AlertBell() {
  const [c, setC] = useState<Counts | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tk, rp, po, ap] = await Promise.all([
        getCountFromServer(query(collection(db, 'supportTickets'), where('status', '==', 'open'))),
        getCountFromServer(query(collection(db, 'supportTickets'), where('portalUnread', '==', true))),
        getCountFromServer(query(collection(db, 'payouts'), where('status', '==', 'pending'))),
        getCountFromServer(query(collection(db, 'astrologers'), where('accountStatus', '==', 'pending'))),
      ]);
      setC({
        tickets: tk.data().count,
        replies: rp.data().count,
        payouts: po.data().count,
        approvals: ap.data().count,
      });
    } catch {
      // A denied/failed read must never blank the bell — keep the last known counts.
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const total = c ? c.tickets + c.payouts + c.approvals : 0;

  const rows = [
    { href: '/support', label: 'Open support tickets', n: c?.tickets ?? 0,
      sub: c && c.replies > 0 ? `${c.replies} new customer ${c.replies === 1 ? 'reply' : 'replies'}` : undefined },
    { href: '/payouts', label: 'Pending payouts', n: c?.payouts ?? 0, sub: undefined },
    { href: '/astrologers', label: 'Astrologers to approve', n: c?.approvals ?? 0, sub: undefined },
  ];

  return (
    <div style={{ position: 'fixed', top: 10, right: 14, zIndex: 1000 }}>
      <button
        onClick={() => { setOpen((o) => !o); load(); }}
        aria-label="Alerts"
        style={{
          position: 'relative', width: 40, height: 40, borderRadius: 999,
          background: '#fff', border: '1px solid #e7e1f5', boxShadow: '0 4px 14px rgba(46,43,95,0.12)',
          display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#2e2b5f',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {total > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 4px',
            borderRadius: 999, background: '#e0564a', color: '#fff', fontSize: 11, fontWeight: 800,
            display: 'grid', placeItems: 'center', border: '2px solid #fff',
          }}>
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: -1 }} aria-hidden />
          <div style={{
            position: 'absolute', top: 48, right: 0, width: 300, background: '#fff',
            borderRadius: 14, border: '1px solid #ece4fb', boxShadow: '0 12px 40px rgba(46,43,95,0.20)',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1ecfb', fontWeight: 800, color: '#2e2b5f', fontSize: 13 }}>
              Needs attention
            </div>
            {rows.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                onClick={() => setOpen(false)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', textDecoration: 'none', color: '#2e2b5f', borderBottom: '1px solid #f6f2fd' }}
              >
                <span style={{
                  minWidth: 26, height: 26, padding: '0 6px', borderRadius: 999,
                  background: r.n > 0 ? '#efe9fb' : '#f4f4f7', color: r.n > 0 ? '#5b3fb0' : '#9891c2',
                  fontWeight: 800, fontSize: 13, display: 'grid', placeItems: 'center',
                }}>
                  {c ? r.n : '—'}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</span>
                  {r.sub && <span style={{ fontSize: 11.5, color: '#e0564a', fontWeight: 700 }}>{r.sub}</span>}
                </span>
              </Link>
            ))}
            {c && total === 0 && (
              <div style={{ padding: '14px', textAlign: 'center', color: '#9891c2', fontSize: 12.5 }}>
                All clear ✨
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
