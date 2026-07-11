'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatPaise } from '@/lib/format';
import { useCardFilter } from '@/lib/useCardFilter';
import { DrawerFilter } from './DrawerFilter';
import { MobileSection } from '@/components/MobileSection';

type Any = Record<string, unknown>;
const ms = (t: Any, k: string) => (t[k] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
const mins = (c: Any) => Math.round(((c.billedSeconds as number) ?? 0) / 60 * 10) / 10;
const fmt = (m: number) => (m ? new Date(m).toLocaleString('en-IN') : '—');

/** Split console for Phone (voice) and Video sessions: Live on the left,
 *  date-filtered Completed on the right. Reads consultations of the given type. */
export function SessionsConsole({ type, title, icon }: { type: 'voice' | 'video'; title: string; icon: string }) {
  const { preset, setPreset, custom, setCustom, range } = useCardFilter(`sessions:${type}`, 'last30');
  const [live, setLive] = useState<Any[] | null>(null);
  const [done, setDone] = useState<Any[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const asnap = await getDocs(query(collection(db, 'astrologers'), limit(500)));
      const nm: Record<string, string> = {};
      asnap.forEach((d) => { nm[d.id] = (d.data() as { name?: string }).name ?? d.id.slice(0, 8); });
      setNames(nm);
    })().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Two BOUNDED queries instead of downloading every consultation of this
      // type: live is bounded by concurrency; completed is bounded by the range
      // + a hard limit. (Needs the composite indexes in firestore.indexes.json.)
      const [liveSnap, doneSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'consultations'),
          where('type', '==', type),
          where('status', 'in', ['active', 'paused']),
        )),
        getDocs(query(
          collection(db, 'consultations'),
          where('type', '==', type),
          where('status', 'in', ['completed', 'expired']),
          where('createdAt', '>=', Timestamp.fromMillis(range.start)),
          where('createdAt', '<', Timestamp.fromMillis(range.end)),
          orderBy('createdAt', 'desc'),
          limit(200),
        )),
      ]);
      if (cancelled) return;
      const map = (s: typeof liveSnap) => s.docs.map((d) => ({ id: d.id, ...d.data() })) as Any[];
      setLive(map(liveSnap).sort((a, b) => ms(b, 'createdAt') - ms(a, 'createdAt')));
      setDone(map(doneSnap)); // already ordered createdAt desc by the query
    })().catch(() => { if (!cancelled) { setLive([]); setDone([]); } });
    return () => { cancelled = true; };
  }, [type, range.start, range.end]);

  const rows = (list: Any[], dateLabel: string) => (
    <div style={{ overflowX: 'auto' }}>
      <table className="cardify">
        <thead><tr><th>User</th><th>Min</th><th>Astrologer</th><th>Payment</th><th>Charged</th><th>{dateLabel}</th></tr></thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id as string}>
              <td data-label="User"><Link href={`/users/${c.customerId}`} style={{ fontWeight: 600 }}>{(c.customerId as string)?.slice(0, 10) ?? '—'}</Link></td>
              <td data-label="Min"><b>{mins(c)}</b></td>
              <td data-label="Astrologer">{names[c.astrologerId as string] ?? '—'}</td>
              <td data-label="Payment">{(c.totalCharged as number) > 0 ? <span className="pay-pill paid">Paid</span> : <span className="pay-pill free">Free</span>}</td>
              <td data-label="Charged" className="uat-amount">{formatPaise(c.totalCharged as number)}</td>
              <td data-label={dateLabel} className="muted">{fmt(ms(c, 'createdAt'))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>{icon} {title}</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Live sessions on the left, completed sessions on the right.</p>

      <div className="card" style={{ marginTop: 14, borderLeft: '4px solid var(--gold)' }}>
        <strong>Heads up:</strong> <span className="muted">{type === 'voice' ? 'Voice' : 'Video'} calling isn’t live in the apps yet (it arrives with the Agora phase), so these panels are ready but stay empty until the first {type} call.</span>
      </div>

      <div className="sess-split">
        {/* LEFT — Live */}
        <MobileSection title="Live sessions" defaultOpen={true}>
        <div className="card sess-col sess-live">
          <div className="sess-col-head">
            <h3 className="celeste" style={{ margin: 0 }}>🟢 Live {type} sessions</h3>
            <span className="udet-total" style={{ background: 'rgba(60,179,113,.14)', color: '#2f9c63' }}>{live?.length ?? 0} live</span>
          </div>
          <p className="muted" style={{ marginTop: 6, fontSize: 12.5 }}>Only the calls happening right now.</p>
          <div className="sess-scroll">
            {live === null ? <p className="muted">Loading…</p>
              : live.length === 0 ? <p className="drawer-muted">No live {type} sessions right now.</p>
                : rows(live, 'Started')}
          </div>
        </div>
        </MobileSection>

        {/* RIGHT — Completed */}
        <MobileSection title="Completed sessions" defaultOpen={false}>
        <div className="card sess-col sess-done">
          <div className="sess-col-head">
            <h3 className="celeste" style={{ margin: 0 }}>✅ Completed {type} sessions</h3>
            <span className="udet-total">{done?.length ?? 0} in range</span>
          </div>
          <DrawerFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} />
          <div className="sess-scroll" style={{ marginTop: 10 }}>
            {done === null ? <p className="muted">Loading…</p>
              : done.length === 0 ? <p className="drawer-muted">No completed {type} sessions in this range.</p>
                : rows(done, 'Ended')}
          </div>
        </div>
        </MobileSection>
      </div>
    </div>
  );
}
