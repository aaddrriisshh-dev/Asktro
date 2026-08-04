'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc, deleteDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { callFn, Row } from '@/lib/hooks';
import { useAuth } from '@/lib/auth-context';
import { AstrologerFormModal } from '@/components/AstrologerFormModal';
import { formatPaise, formatDate } from '@/lib/format';

type Any = Record<string, unknown>;
const ms = (t: Any | undefined, k: string) => (t?.[k] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
const minsOf = (c: Any) => Math.round(((c.billedSeconds as number) ?? 0) / 60 * 10) / 10;

export default function AstrologerViewPage() {
  const { id } = useParams<{ id: string }>();
  const [a, setA] = useState<Any | null>(null);
  const [missing, setMissing] = useState(false);
  const [cons, setCons] = useState<Any[]>([]);
  const [tab, setTab] = useState<'voice' | 'video' | 'all'>('all');
  const [rsBusy, setRsBusy] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const { adminRole } = useAuth();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, 'astrologers', id));
      if (!snap.exists()) { setMissing(true); return; }
      // Contact PII (email/phone) and money (earnings/pendingPayout/commission)
      // now live in private subdocs — admins may read them; customers cannot.
      // Merge them in for the admin detail view.
      const [contactSnap, finSnap] = await Promise.all([
        getDoc(doc(db, 'astrologers', id, 'private', 'contact')),
        getDoc(doc(db, 'astrologers', id, 'private', 'financials')),
      ]);
      const contact = contactSnap.exists() ? contactSnap.data() : {};
      const financials = finSnap.exists() ? finSnap.data() : {};
      setA({ id, ...snap.data(), ...contact, ...financials });
      // Bounded to most-recent 200 (index: astrologerId+createdAt DESC).
      const cs = await getDocs(query(collection(db, 'consultations'), where('astrologerId', '==', id), orderBy('createdAt', 'desc'), limit(200)));
      setCons(cs.docs.map((d) => ({ id: d.id, ...d.data() })));
    })().catch(() => setMissing(true));
  }, [id]);

  async function toggleRisingStar() {
    if (!a || rsBusy) return;
    const next = !(a.risingStar as boolean);
    setRsBusy(true);
    try {
      await callFn('updateAstrologer', { astrologerId: id, risingStar: next });
      setA({ ...a, risingStar: next });
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setRsBusy(false); }
  }

  async function deleteAstrologer() {
    if (!a || delBusy) return;
    const nm = (a.name as string) || 'this astrologer';
    // Two-step confirm — deletion is permanent and can't be undone.
    if (!window.confirm(`Delete ${nm}? This permanently removes the profile from the store. This cannot be undone.`)) return;
    if (!window.confirm(`Are you absolutely sure? ${nm} will disappear from the app immediately.`)) return;
    setDelBusy(true);
    try {
      await deleteDoc(doc(db, 'astrologers', id));
      router.push('/astrologers');
    } catch (e) { alert('Failed to delete: ' + (e as Error).message); setDelBusy(false); }
  }

  if (missing) return <div><Link href="/astrologers" className="btn secondary sm">← Back</Link><p className="muted" style={{ marginTop: 20 }}>Astrologer not found.</p></div>;
  if (!a) return <p className="muted">Loading…</p>;

  const voice = cons.filter((c) => c.type === 'voice');
  const video = cons.filter((c) => c.type === 'video');
  const list = tab === 'voice' ? voice : tab === 'video' ? video : cons;
  const rating = (a.rating as number) ?? 0;
  const status = (a.accountStatus as string) ?? 'pending';
  const reviews = cons
    .filter((c) => c.rating != null)
    .sort((x, y) => ms(y, 'updatedAt') - ms(x, 'updatedAt'));

  return (
    <div className="udet">
      <div className="udet-top">
        <div className="udet-title">
          <Link href="/astrologers" className="udet-back" aria-label="Back">←</Link>
          <div>
            <h1 style={{ margin: 0 }}>{(a.name as string) || 'Unnamed'}
              <span className={`badge ${status === 'approved' ? 'green' : status === 'pending' ? 'amber' : 'red'}`} style={{ marginLeft: 10, verticalAlign: 'middle' }}>{status}</span>
              {a.isAI ? <span className="badge purple" style={{ marginLeft: 6 }}>AI</span> : null}
              {a.risingStar ? <span className="badge amber" style={{ marginLeft: 6 }}>★ Rising Star</span> : null}
            </h1>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: 12.5, fontFamily: 'monospace' }}>
              ID {id.slice(0, 8)} · added {ms(a, 'addedAt') ? formatDate(ms(a, 'addedAt')) : (ms(a, 'createdAt') ? formatDate(ms(a, 'createdAt')) : '—')}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn sm ${a.risingStar ? 'secondary' : ''}`}
            onClick={toggleRisingStar}
            disabled={rsBusy}
            title="Show this astrologer in the app's Rising Stars rail"
          >
            {rsBusy ? '…' : a.risingStar ? '★ Remove Rising Star' : '☆ Mark Rising Star'}
          </button>
          <button className="btn sm" onClick={() => setShowEdit(true)}>✎ Edit Profile</button>
          {adminRole === 'super' && (
            <button
              className="btn sm"
              onClick={deleteAstrologer}
              disabled={delBusy}
              title="Permanently remove this astrologer from the store"
              style={{ background: '#c0392b', borderColor: '#c0392b', color: '#fff' }}
            >
              {delBusy ? 'Deleting…' : '🗑 Delete'}
            </button>
          )}
        </div>
      </div>

      {showEdit && (
        <AstrologerFormModal
          mode="edit"
          isSuper={adminRole === 'super'}
          astrologer={a as unknown as Row}
          onClose={() => setShowEdit(false)}
          onSaved={(patch) => setA({ ...a, ...patch })}
        />
      )}

      <div className="aview-grid">
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="aview-avatar">
            {a.profilePhoto
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={a.profilePhoto as string} alt={(a.name as string) || 'A'} />
              : <span>{((a.name as string) || '?').trim().charAt(0).toUpperCase()}</span>}
          </div>
          <h3 style={{ margin: '12px 0 2px' }}>{a.name as string}</h3>
          <div className="muted" style={{ fontSize: 13 }}>★ {rating.toFixed(1)} ({(a.totalReviews as number) ?? 0})</div>
          <div style={{ marginTop: 8 }}><span className={`badge ${a.onlineStatus ? 'green' : ''}`}>{a.onlineStatus ? '● Online' : 'Offline'}</span></div>

          <div className="aview-meta" style={{ textAlign: 'left' }}>
            <div className="row"><span className="k">Email</span><b>{(a.email as string) || '—'}</b></div>
            <div className="row"><span className="k">Phone</span><b>{(a.phone as string) || '—'}</b></div>
            <div className="row"><span className="k">Experience</span><b>{(a.experience as number) ?? 0} years</b></div>
            <div className="row"><span className="k">Rate</span><b>₹{(((a.ratePerMinutePaise as number) ?? 900) / 100)}/min</b></div>
            <div className="row"><span className="k">Commission</span><b style={{ color: 'var(--gold-deep)' }}>{(a.commissionPercent as number) ?? '—'}%</b></div>
            <div className="row"><span className="k">Added by</span><b>{(a.addedByName as string) || '—'}</b></div>
            <div className="row"><span className="k">Approved by</span><b>{(a.approvedByName as string) || '—'}</b></div>
          </div>

          {Array.isArray(a.expertise) && (a.expertise as string[]).length > 0 && (
            <div style={{ marginTop: 16, textAlign: 'left' }}>
              <p className="af-label" style={{ margin: '0 0 8px' }}>Expertise Areas</p>
              <div className="pickrow">{(a.expertise as string[]).map((x) => <span key={x} className="badge amber">{x}</span>)}</div>
            </div>
          )}
        </div>

        <div>
          <div className="aview-stats">
            <div className="aview-stat"><div className="k">📞 Total Calls</div><div className="v">{voice.length}</div></div>
            <div className="aview-stat"><div className="k">🎥 Video Calls</div><div className="v">{video.length}</div></div>
            <div className="aview-stat"><div className="k">💰 Earnings</div><div className="v">{formatPaise((a.earnings as number) ?? 0)}</div></div>
            <div className="aview-stat"><div className="k">⭐ Rating</div><div className="v">{rating.toFixed(1)}</div></div>
          </div>

          <div className="aview-tabs">
            <button className={`aview-tab${tab === 'voice' ? ' on' : ''}`} onClick={() => setTab('voice')}>Audio Calls</button>
            <button className={`aview-tab${tab === 'video' ? ' on' : ''}`} onClick={() => setTab('video')}>Video Calls</button>
            <button className={`aview-tab${tab === 'all' ? ' on' : ''}`} onClick={() => setTab('all')}>All Sessions</button>
          </div>

          <div className="card">
            <h3 className="celeste" style={{ marginTop: 0 }}>{tab === 'voice' ? '📞 Audio' : tab === 'video' ? '🎥 Video' : '🗂 All'} session history</h3>
            {list.length === 0 ? (
              <p className="drawer-muted" style={{ textAlign: 'center', padding: '24px 0' }}>
                No {tab === 'all' ? '' : tab + ' '}sessions yet.{(tab === 'voice' || tab === 'video') ? ' Call logs populate once voice/video calling is enabled.' : ''}
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="cardify">
                  <thead><tr><th>Date</th><th>Type</th><th>Duration</th><th>Status</th><th>Charged</th></tr></thead>
                  <tbody>
                    {list.map((c) => (
                      <tr key={c.id as string}>
                        <td data-label="Date">{ms(c, 'createdAt') ? formatDate(ms(c, 'createdAt')) : '—'}</td>
                        <td data-label="Type" style={{ textTransform: 'capitalize' }}>{(c.type as string) ?? '—'}</td>
                        <td data-label="Duration">{minsOf(c)} min</td>
                        <td data-label="Status"><span className={`badge ${c.status === 'completed' || c.status === 'active' ? 'green' : ''}`}>{(c.status as string) ?? '—'}</span></td>
                        <td data-label="Charged">{formatPaise(c.totalCharged as number)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3 className="celeste" style={{ marginTop: 0 }}>⭐ Reviews ({reviews.length})</h3>
            {reviews.length === 0 ? (
              <p className="drawer-muted" style={{ textAlign: 'center', padding: '24px 0' }}>
                No reviews yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {reviews.map((c) => {
                  const bd = (c.ratingBreakdown as Any) ?? {};
                  const stars = Math.round((c.rating as number) ?? 0);
                  return (
                    <div key={c.id as string} style={{ borderBottom: '1px solid #eee', paddingBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#e6a800' }}>
                          {'★'.repeat(stars)}<span style={{ color: '#ddd' }}>{'★'.repeat(5 - stars)}</span>
                        </span>
                        <span className="muted" style={{ fontSize: 12 }}>{ms(c, 'updatedAt') ? formatDate(ms(c, 'updatedAt')) : ''}</span>
                      </div>
                      {c.review ? (
                        <p style={{ margin: '6px 0' }}>{c.review as string}</p>
                      ) : (
                        <p className="muted" style={{ margin: '6px 0', fontStyle: 'italic' }}>No written comment</p>
                      )}
                      {(bd.behavior != null || bd.accuracy != null || bd.overall != null) && (
                        <div className="muted" style={{ display: 'flex', gap: 14, fontSize: 12, flexWrap: 'wrap' }}>
                          {bd.behavior != null && <span>Behaviour: {bd.behavior as number}/5</span>}
                          {bd.accuracy != null && <span>Accuracy: {bd.accuracy as number}/5</span>}
                          {bd.overall != null && <span>Overall: {bd.overall as number}/5</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
