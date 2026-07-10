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
const minsOf = (c: Any) => Math.round(((c.billedSeconds as number) ?? 0) / 60 * 10) / 10;

/** One consultation in the history timeline; expands to its live transcript (chat)
 *  or a recording placeholder (voice/video, until calling ships). */
function SessionCard({ c, meId, astroName }: { c: Any; meId: string; astroName: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Any[] | null>(null);
  const type = (c.type as string) ?? 'chat';

  useEffect(() => {
    if (!open || type !== 'chat') return;
    const unsub = onSnapshot(
      query(collection(db, `consultations/${c.id}/messages`), orderBy('timestamp', 'asc'), limit(500)),
      (snap) => setMsgs(snap.docs.map((d) => d.data())),
      () => setMsgs([]),
    );
    return () => unsub();
  }, [open, type, c.id]);

  const icon = type === 'voice' ? '📞' : type === 'video' ? '🎥' : '💬';
  const status = (c.status as string) ?? '—';

  // Refund: available on a finished, charged session that isn't fully refunded.
  const charged = (c.totalCharged as number) ?? 0;
  const refunded0 = (c.refundedPaise as number) ?? 0;
  const [refunding, setRefunding] = useState(false);
  const [didRefund, setDidRefund] = useState(false);
  const refundable = Math.max(0, charged - refunded0);
  const canRefund = (status === 'completed' || status === 'expired') && refundable > 0 && !didRefund;

  async function refund() {
    const amtStr = window.prompt(`Refund amount in ₹ (max ₹${(refundable / 100).toFixed(2)}).\nLeave blank for a FULL refund of ₹${(refundable / 100).toFixed(2)}.`);
    if (amtStr === null) return; // cancelled
    const reason = window.prompt('Reason for this refund (optional):') ?? '';
    let amountPaise: number | undefined;
    if (amtStr.trim() !== '') {
      amountPaise = Math.round(Number(amtStr) * 100);
      if (!Number.isFinite(amountPaise) || amountPaise <= 0) { alert('Enter a valid positive amount.'); return; }
    }
    setRefunding(true);
    try {
      await callFn('refundConsultation', { consultationId: c.id, ...(amountPaise !== undefined ? { amountPaise } : {}), reason });
      setDidRefund(true);
      alert('Refund processed — the customer was credited and the astrologer’s accrual reversed.');
    } catch (e) {
      alert('Refund failed: ' + ((e as Error).message ?? String(e)));
    } finally {
      setRefunding(false);
    }
  }

  return (
    <div className={`udet-sess${open ? ' open' : ''}`}>
      <button className="udet-sess-head" onClick={() => setOpen((o) => !o)}>
        <span className="udet-sess-icon">{icon}</span>
        <div className="udet-sess-main">
          <span className="udet-sess-title">{type.charAt(0).toUpperCase() + type.slice(1)} · {astroName}</span>
          <span className="udet-sess-sub">
            {ms(c, 'createdAt') ? formatDate(ms(c, 'createdAt')) : '—'} · {minsOf(c)} min · {formatPaise(c.totalCharged as number)}
          </span>
        </div>
        <span className={`badge ${status === 'active' || status === 'completed' ? 'green' : ''}`}>{status}</span>
        <span className="ops-caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="udet-sess-body">
          {type === 'chat' ? (
            msgs === null ? <p className="muted">Loading…</p>
              : msgs.length === 0 ? <p className="drawer-muted">No messages in this session.</p>
                : (
                  <div className="udet-chat">
                    {msgs.map((m, i) => {
                      const mine = (m.senderId as string) === meId;
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
                )
          ) : (
            <p className="drawer-muted" style={{ margin: 0 }}>
              {type} call · {minsOf(c)} min. The call recording will appear here once voice/video calling is enabled.
            </p>
          )}
          {(canRefund || didRefund) && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--border, #eee)', paddingTop: 10 }}>
              {didRefund ? (
                <p className="muted" style={{ margin: 0 }}>✓ Refunded. Reload to see updated totals.</p>
              ) : (
                <button
                  onClick={refund}
                  disabled={refunding}
                  style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #d9534f', color: '#d9534f', background: 'transparent', fontWeight: 600, cursor: refunding ? 'default' : 'pointer' }}
                >
                  {refunding ? 'Refunding…' : `Refund (up to ₹${(refundable / 100).toFixed(0)})`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<Any | null>(null);
  const [missing, setMissing] = useState(false);
  const [cons, setCons] = useState<Any[]>([]);
  const [txns, setTxns] = useState<Any[]>([]);
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
      const ts = await getDocs(query(collection(db, 'walletTransactions'), where('userId', '==', id)));
      setTxns(ts.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b, 'createdAt') - ms(a, 'createdAt')));
      const asnap = await getDocs(collection(db, 'astrologers'));
      const names: Record<string, string> = {};
      asnap.forEach((d) => { names[d.id] = (d.data() as { name?: string }).name ?? d.id.slice(0, 8); });
      setAstroNames(names);
    })().catch(() => setMissing(true));
  }, [id]);

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

  const snapshot = [
    { label: 'Wallet balance', value: formatPaise((user.walletBalance as number) ?? 0) },
    { label: 'Bonus / free credit', value: formatPaise((user.bonusBalance as number) ?? 0) },
    { label: 'Total recharged', value: formatPaise((user.totalRecharge as number) ?? 0) },
    { label: 'Total spent', value: formatPaise((user.totalSpent as number) ?? 0) },
    { label: 'Consultations', value: String(cons.length) },
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

        <div className="udet-right card">
          <h3 className="celeste" style={{ marginTop: 0 }}>◇ Account Snapshot</h3>
          <div className="udet-fields">
            {snapshot.map((s) => (
              <div key={s.label} className="udet-field"><span>{s.label}</span><strong>{s.value}</strong></div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" id="chat" style={{ marginTop: 18 }}>
        <div className="udet-log-head">
          <h3 className="celeste" style={{ margin: 0 }}>🗂 Consultation History</h3>
          <span className="udet-total">{cons.length} session{cons.length === 1 ? '' : 's'}</span>
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Every chat, voice and video session, newest first. Tap any session to read the full transcript.
        </p>
        {cons.length === 0
          ? <p className="drawer-muted">No consultations yet. Sessions from the app appear here.</p>
          : <div className="udet-sess-list">
              {cons.map((c) => (
                <SessionCard key={c.id as string} c={c} meId={id} astroName={astroNames[c.astrologerId as string] ?? '—'} />
              ))}
            </div>}
      </div>

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
