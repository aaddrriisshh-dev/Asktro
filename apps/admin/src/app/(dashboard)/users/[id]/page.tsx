'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  doc, getDoc, collection, query, where, getDocs, onSnapshot, orderBy, limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { callFn } from '@/lib/hooks';
import { formatPaise, rupeesToPaise, formatDate } from '@/lib/format';

type Any = Record<string, unknown>;
const ms = (t: Any | undefined, k: string) => (t?.[k] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<Any | null>(null);
  const [missing, setMissing] = useState(false);
  const [cons, setCons] = useState<Any[]>([]);
  const [txns, setTxns] = useState<Any[]>([]);
  const [chat, setChat] = useState<Any[] | null>(null);
  const [chatConsId, setChatConsId] = useState<string | null>(null);
  const [astroNames, setAstroNames] = useState<Record<string, string>>({});
  const [kundliOpen, setKundliOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, 'users', id));
      if (!snap.exists()) { setMissing(true); return; }
      setUser({ id, ...snap.data() });
      const cs = await getDocs(query(collection(db, 'consultations'), where('customerId', '==', id)));
      const clist: Any[] = cs.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b, 'createdAt') - ms(a, 'createdAt'));
      setCons(clist);
      // chat log shows the customer's latest CHAT session
      const chatCons = clist.find((c) => c.type === 'chat') ?? clist[0];
      setChatConsId((chatCons?.id as string) ?? null);
      const ts = await getDocs(query(collection(db, 'walletTransactions'), where('userId', '==', id)));
      setTxns(ts.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b, 'createdAt') - ms(a, 'createdAt')));
      const asnap = await getDocs(collection(db, 'astrologers'));
      const names: Record<string, string> = {};
      asnap.forEach((d) => { names[d.id] = (d.data() as { name?: string }).name ?? d.id.slice(0, 8); });
      setAstroNames(names);
    })().catch(() => setMissing(true));
  }, [id]);

  function CallLog({ title, icon, type }: { title: string; icon: string; type: string }) {
    const list = cons.filter((c) => c.type === type);
    return (
      <div className="card" style={{ marginTop: 18 }}>
        <div className="udet-log-head"><h3 className="celeste" style={{ margin: 0 }}>{icon} {title}</h3><span className="udet-total">{list.length} total</span></div>
        {list.length === 0 ? <p className="muted">No {type} calls yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Date &amp; time</th><th>Astrologer</th><th>Duration</th><th>Status</th><th>Charged</th></tr></thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id as string}>
                    <td>{ms(c, 'createdAt') ? formatDate(ms(c, 'createdAt')) : '—'}</td>
                    <td>{astroNames[c.astrologerId as string] ?? '—'}</td>
                    <td>{Math.round(((c.billedSeconds as number) ?? 0) / 60 * 10) / 10} min</td>
                    <td><span className={`badge ${c.status === 'active' ? 'green' : c.status === 'completed' ? 'green' : ''}`}>{(c.status as string) ?? '—'}</span></td>
                    <td>{formatPaise(c.totalCharged as number)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // live chat log from the customer's latest consultation
  useEffect(() => {
    if (!chatConsId) { setChat([]); return; }
    const unsub = onSnapshot(
      query(collection(db, `consultations/${chatConsId}/messages`), orderBy('timestamp', 'asc'), limit(300)),
      (snap) => setChat(snap.docs.map((d) => d.data())),
      () => setChat([]),
    );
    return () => unsub();
  }, [chatConsId]);

  async function act(kind: 'credit' | 'suspend' | 'delete') {
    if (!user) return;
    if (kind === 'credit') {
      const v = prompt('Credit how many ₹ to this wallet?');
      if (!v) return;
      try { await callFn('adjustWallet', { userId: id, amountPaise: rupeesToPaise(Number(v)), reason: 'Admin credit' }); alert('Credited.'); }
      catch (e) { alert('Failed: ' + (e as Error).message); }
    } else if (kind === 'suspend') {
      const next = user.accountStatus === 'blocked' ? 'active' : 'blocked';
      if (!confirm(`${next === 'blocked' ? 'Suspend' : 'Reactivate'} this customer?`)) return;
      try { await callFn('setUserStatus', { userId: id, status: next }); setUser({ ...user, accountStatus: next }); }
      catch (e) { alert('Failed: ' + (e as Error).message); }
    } else {
      if (!confirm('Delete this profile?')) return;
      try { await callFn('setUserStatus', { userId: id, status: 'deleted' }); router.push('/'); }
      catch (e) { alert('Failed: ' + (e as Error).message); }
    }
  }

  if (missing) return <div><Link href="/" className="btn secondary sm">← Back</Link><p className="muted" style={{ marginTop: 20 }}>Customer not found.</p></div>;
  if (!user) return <p className="muted">Loading…</p>;

  const status = (user.accountStatus as string) ?? 'active';
  const birthMs = user.birthDateMs as number | undefined;
  const details = [
    { label: 'Name', value: (user.name as string) || '—' },
    { label: 'Phone', value: (user.phone as string) || '—' },
    { label: 'Gender', value: (user.gender as string) || '—' },
    { label: 'Date of birth', value: birthMs ? new Date(birthMs).toLocaleDateString('en-GB') : '—' },
    { label: 'Time of birth', value: (user.birthTime as string) || (user.birthTimeKnown === false ? 'Unknown' : '—') },
    { label: 'Place of birth', value: (user.birthPlace as string) || '—' },
    { label: 'Languages', value: Array.isArray(user.languages) ? (user.languages as string[]).join(', ') : '—' },
    { label: 'Relationship', value: (user.relationshipStatus as string) || '—' },
  ];

  return (
    <div className="udet">
      <div className="udet-top">
        <div className="udet-title">
          <Link href="/" className="udet-back" aria-label="Back">←</Link>
          <div className="udet-avatar">
            {user.profilePhoto
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={user.profilePhoto as string} alt={(user.name as string) || 'Customer'} />
              : <span>{((user.name as string) || '?').trim().charAt(0).toUpperCase()}</span>}
          </div>
          <div>
            <h1 style={{ margin: 0 }}>{(user.name as string) || 'Unnamed customer'}
              <span className={`badge ${status === 'blocked' ? 'red' : 'green'}`} style={{ marginLeft: 10, verticalAlign: 'middle' }}>{status}</span>
            </h1>
            <p className="muted" style={{ margin: '2px 0 0' }}>{(user.phone as string) || id} · customer since {ms(user, 'createdAt') ? new Date(ms(user, 'createdAt')).toLocaleDateString('en-GB') : '—'}</p>
          </div>
        </div>
        <div className="udet-acts">
          <button className="btn sm" onClick={() => act('credit')}>+ Credit</button>
          <button className="btn sm secondary" onClick={() => act('suspend')}>{status === 'blocked' ? 'Reactivate' : 'Suspend'}</button>
          <button className="btn sm danger" onClick={() => act('delete')}>Delete</button>
        </div>
      </div>

      <div className="udet-grid">
        <div className="udet-left">
          <div className="card">
            <h3 className="celeste">✦ Customer Details</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Provided by the customer during onboarding.</p>
            <div className="udet-fields">
              {details.map((d) => (
                <div key={d.label} className="udet-field"><span>{d.label}</span><strong>{d.value}</strong></div>
              ))}
            </div>
          </div>

          <div className="card udet-soon">
            <button className="udet-soon-head" onClick={() => setKundliOpen((o) => !o)}>
              <span className="celeste">✦ Kundli &amp; Planetary Details</span>
              <span className="udet-soon-tag">Coming soon</span>
              <span className="ops-caret">{kundliOpen ? '▴' : '▾'}</span>
            </button>
            {kundliOpen && (
              <p className="muted" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5 }}>
                Nakshatra, Moon sign, Ascendant and Dasha will be computed from the birth details above via the Vedic
                astrology API (Prokerala) once it's integrated. This section will fill in automatically then.
              </p>
            )}
          </div>
        </div>

        <div className="udet-right card" id="chat">
          <div className="udet-chat-head">
            <h3 className="celeste" style={{ margin: 0 }}>💬 Live Chat Log</h3>
            <span className="muted" style={{ fontSize: 12 }}>{chatConsId ? 'Latest session' : 'No sessions yet'}</span>
          </div>
          <div className="udet-chat">
            {chat === null ? <p className="muted">Loading…</p>
              : chat.length === 0 ? <p className="drawer-muted">No chat messages yet. Conversations from the app appear here live.</p>
                : chat.map((m, i) => {
                  const mine = (m.senderId as string) === id; // customer's own message
                  return (
                    <div key={i} className={`bub ${mine ? 'me' : 'them'}`}>
                      {(m.type as string) === 'image' && m.image
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={m.image as string} alt="attachment" style={{ maxWidth: 200, borderRadius: 10 }} />
                        : <span>{(m.text as string) ?? ''}</span>}
                    </div>
                  );
                })}
          </div>
        </div>
      </div>

      <CallLog title="Voice Call History" icon="📞" type="voice" />
      <CallLog title="Video Call History" icon="🎥" type="video" />

      <div className="card" style={{ marginTop: 18 }}>
        <h3 className="celeste">▤ Transaction History</h3>
        {txns.length === 0 ? <p className="muted">No transactions yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Note</th></tr></thead>
              <tbody>
                {txns.map((t) => {
                  const amt = (t.amount as number) ?? 0;
                  return (
                    <tr key={t.id as string}>
                      <td>{ms(t, 'createdAt') ? formatDate(ms(t, 'createdAt')) : '—'}</td>
                      <td style={{ textTransform: 'capitalize' }}>{(t.kind as string) ?? '—'}</td>
                      <td style={{ color: amt < 0 ? 'var(--error)' : 'var(--success)', fontWeight: 600 }}>{amt < 0 ? '−' : '+'}{formatPaise(Math.abs(amt))}</td>
                      <td className="muted">{(t.note as string) ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
