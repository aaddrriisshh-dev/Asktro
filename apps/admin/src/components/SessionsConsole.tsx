'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatPaise } from '@/lib/format';
import { useCardFilter } from '@/lib/useCardFilter';
import { DrawerFilter } from './DrawerFilter';

type Any = Record<string, unknown>;
const ms = (t: Any, k: string) => (t[k] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
const mins = (c: Any) => Math.round(((c.billedSeconds as number) ?? 0) / 60 * 10) / 10;
const fmt = (m: number) => (m ? new Date(m).toLocaleString('en-IN') : '—');

/** Shared console for Phone (voice) and Video session logs. Live sessions + a
 *  date-filtered completed log. Reads consultations of the given type. */
export function SessionsConsole({ type, title, icon }: { type: 'voice' | 'video'; title: string; icon: string }) {
  const { preset, setPreset, custom, setCustom, range } = useCardFilter(`sessions:${type}`, 'last30');
  const [live, setLive] = useState<Any[] | null>(null);
  const [done, setDone] = useState<Any[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const asnap = await getDocs(collection(db, 'astrologers'));
      const nm: Record<string, string> = {};
      asnap.forEach((d) => { nm[d.id] = (d.data() as { name?: string }).name ?? d.id.slice(0, 8); });
      setNames(nm);
    })().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Single-field query by type; split live vs completed + date filter client-side.
      const snap = await getDocs(query(collection(db, 'consultations'), where('type', '==', type)));
      if (cancelled) return;
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Any[];
      setLive(rows.filter((r) => r.status === 'active' || r.status === 'paused').sort((a, b) => ms(b, 'createdAt') - ms(a, 'createdAt')));
      setDone(rows
        .filter((r) => r.status === 'completed' || r.status === 'expired')
        .filter((r) => { const m = ms(r, 'createdAt'); return m >= range.start && m < range.end; })
        .sort((a, b) => ms(b, 'createdAt') - ms(a, 'createdAt')));
    })().catch(() => { if (!cancelled) { setLive([]); setDone([]); } });
    return () => { cancelled = true; };
  }, [type, range.start, range.end]);

  const row = (c: Any) => (
    <tr key={c.id as string}>
      <td>
        <Link href={`/users/${c.customerId}`} style={{ fontWeight: 600 }}>{(c.customerId as string)?.slice(0, 10) ?? '—'}</Link>
      </td>
      <td><b>{mins(c)}</b> min</td>
      <td>{names[c.astrologerId as string] ?? '—'}</td>
      <td>{(c.totalCharged as number) > 0 ? <span className="pay-pill paid">Paid</span> : <span className="pay-pill free">Free</span>}</td>
      <td className="uat-amount">{formatPaise(c.totalCharged as number)}</td>
      <td className="muted">{fmt(ms(c, 'createdAt'))}</td>
    </tr>
  );

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>{icon} {title}</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Live and completed {type} consultations, with minutes, user and payment.</p>

      <div className="card" style={{ marginTop: 16, borderLeft: '4px solid var(--gold)' }}>
        <strong>Heads up:</strong> <span className="muted">{type === 'voice' ? 'Voice' : 'Video'} calling isn’t live in the apps yet (it arrives with the Agora phase), so this console is ready but will stay empty until the first {type} call happens.</span>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="celeste" style={{ marginTop: 0 }}>🟢 Live {type} sessions</h3>
        {live === null ? <p className="muted">Loading…</p> : live.length === 0 ? <p className="drawer-muted">No live {type} sessions right now.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table><thead><tr><th>User</th><th>Minutes</th><th>Astrologer</th><th>Payment</th><th>Charged</th><th>Started</th></tr></thead>
              <tbody>{live.map(row)}</tbody></table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="udet-log-head">
          <h3 className="celeste" style={{ margin: 0 }}>✅ Completed {type} sessions</h3>
          <span className="udet-total">{done?.length ?? 0} in range</span>
        </div>
        <DrawerFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} />
        {done === null ? <p className="muted" style={{ marginTop: 12 }}>Loading…</p> : done.length === 0 ? <p className="drawer-muted" style={{ marginTop: 12 }}>No completed {type} sessions in this range.</p> : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table><thead><tr><th>User</th><th>Minutes</th><th>Astrologer</th><th>Payment</th><th>Charged</th><th>Ended</th></tr></thead>
              <tbody>{done.map(row)}</tbody></table>
          </div>
        )}
      </div>
    </div>
  );
}
