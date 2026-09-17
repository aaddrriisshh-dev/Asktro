'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCollection, callFn, Row } from '@/lib/hooks';
import { useAuth } from '@/lib/auth-context';
import { AstrologerFormModal } from '@/components/AstrologerFormModal';
import { MobileSection } from '@/components/MobileSection';

const STATUS_COLORS: Record<string, string> = {
  approved: 'green', pending: 'amber', suspended: 'red', rejected: 'red', disabled: 'red',
};
const rupees = (paise: unknown) => (typeof paise === 'number' ? paise / 100 : null);

type BoxAction = 'view' | 'edit' | 'approve';

/** Round profile avatar with an initials fallback (recognise faces at a glance). */
function Avatar({ photo, name }: { photo?: unknown; name?: unknown }) {
  const [err, setErr] = useState(false);
  const url = typeof photo === 'string' && photo.trim().length > 0 ? photo.trim() : '';
  const initials =
    String(name ?? '').trim().split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  if (url && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        width={40}
        height={40}
        onError={() => setErr(true)}
        style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flex: 'none', background: '#efeaf7' }}
      />
    );
  }
  return (
    <span
      style={{ width: 40, height: 40, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: '#ece7f8', color: '#6a5acd', fontWeight: 700, fontSize: 14 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

function AstroBox({
  title, icon, accent, list, isSuper, busy, actions, showLiveDot, onStatus, onEditRate, domId,
}: {
  title: string; icon: string; accent: string; list: Row[];
  isSuper: boolean; busy: string | null; actions: BoxAction[]; showLiveDot?: boolean;
  onStatus: (id: string, status: string, name?: string) => void; onEditRate: (a: Row) => void;
  domId?: string;
}) {
  // `wide` = the "View all" full-page grid mode: the card breaks out to full
  // width and re-flows its list into a wrapping grid of compact cards.
  const [wide, setWide] = useState(false);
  const [q, setQ] = useState('');
  const filtered = q.trim()
    ? list.filter((a) => {
        const t = q.trim().toLowerCase();
        return String(a.name ?? '').toLowerCase().includes(t)
          || (Array.isArray(a.expertise) && (a.expertise as string[]).some((e) => e.toLowerCase().includes(t)));
      })
    : list;
  const shown = wide ? filtered : filtered.slice(0, 10);
  return (
    <div id={domId} className={`card custcard${wide ? ' custcard--wide' : ''}`} style={{ borderTop: `3px solid ${accent}` }}>
      <div className="sess-col-head">
        <h3 className="celeste" style={{ margin: 0, fontSize: 16 }}>{icon} {title}</h3>
        <span className="udet-total">{list.length}</span>
      </div>
      <div style={{ position: 'relative', margin: '4px 0 10px' }}>
        <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', opacity: 0.45, fontSize: 13, pointerEvents: 'none' }}>🔍</span>
        <input
          className="input"
          style={{ paddingLeft: 32, height: 36, fontSize: 13, width: '100%' }}
          placeholder={`Search ${title.toLowerCase()} by name…`}
          value={q}
          onChange={(e) => { setQ(e.target.value); setWide(false); }}
        />
      </div>
      <div className={`custlist${wide ? ' custgrid' : ''}`}>
        {shown.length === 0 ? <p className="drawer-muted" style={{ margin: '10px 0' }}>{q.trim() ? 'No matches.' : 'Nothing here yet.'}</p> : shown.map((a) => {
          const rate = rupees(a.ratePerMinutePaise);
          const st = (a.accountStatus ?? 'pending') as string;
          const nameEls = (
            <span className="nm">
              {showLiveDot && a.onlineStatus ? <span className="live-dot" style={{ marginRight: 6 }} /> : null}
              {a.name || 'Unnamed'}
              {a.verified ? ' ✓' : ''}
              {a.isAI ? <span className="badge purple" style={{ marginLeft: 6, fontSize: 10 }}>AI</span> : null}
            </span>
          );
          const metaEls = (
            <span className="ph">
              {rate != null ? `₹${rate}/min` : 'default rate'} · <span className={`badge ${STATUS_COLORS[st] ?? ''}`} style={{ fontSize: 10 }}>{st}</span>
            </span>
          );
          const actionEls = (
            <>
              {actions.includes('view') && <Link href={`/astrologers/${a.id}`} className="btn sm secondary">View</Link>}
              {actions.includes('edit') && <button className="btn sm secondary" disabled={busy === a.id} onClick={() => onEditRate(a)}>✎ Edit</button>}
              {actions.includes('approve') && isSuper && (
                <>
                  <button className="btn sm" disabled={busy === a.id} onClick={() => onStatus(a.id, 'approved')}>✓</button>
                  <button className="btn sm danger" disabled={busy === a.id} onClick={() => { if (confirm(`Reject ${a.name}?`)) onStatus(a.id, 'rejected'); }}>✕</button>
                </>
              )}
            </>
          );
          // Full-page grid: a compact vertical card (avatar on top, centered).
          if (wide) {
            return (
              <div key={a.id} className="custcardlet">
                <Avatar photo={a.profilePhoto} name={a.name} />
                <div className="custcardlet-body">{nameEls}{metaEls}</div>
                <div className="custrow-right" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>{actionEls}</div>
              </div>
            );
          }
          // Column list: the existing horizontal row.
          return (
            <div key={a.id} className="custrow">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Avatar photo={a.profilePhoto} name={a.name} />
                <div style={{ minWidth: 0 }}>{nameEls}{metaEls}</div>
              </div>
              <div className="custrow-right" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>{actionEls}</div>
            </div>
          );
        })}
      </div>
      <div className="custfoot">
        <span className="muted">Showing {shown.length} of {filtered.length}</span>
        {filtered.length > 10 && (
          <button className="btn sm secondary" onClick={() => setWide((w) => !w)}>
            {wide ? 'Show less' : `View all (${filtered.length})`}
          </button>
        )}
      </div>
    </div>
  );
}

function AstrologersManagement() {
  const { rows, loading } = useCollection('astrologers');
  const { adminRole } = useAuth();
  const isSuper = adminRole === 'super';
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Deep-link filter from the dashboard drawer sub-tiles:
  // online | pending | verified | featured | all. No param = current behaviour.
  const sp = useSearchParams();
  const filterParam = sp.get('filter');

  async function setStatus(id: string, status: string) {
    setBusy(id);
    try { await callFn('setAstrologerStatus', { astrologerId: id, status }); }
    catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(null); }
  }

  const live = rows.filter((a: Row) => a.onlineStatus === true);
  const pending = rows.filter((a: Row) => (a.accountStatus ?? 'pending') === 'pending');

  // The "All Astrologers" box narrows to verified / featured when drilled in.
  const allList =
    filterParam === 'verified' ? rows.filter((a: Row) => a.verified === true)
    : filterParam === 'featured' ? rows.filter((a: Row) => a.featured === true)
    : rows;
  const allTitle =
    filterParam === 'verified' ? 'Verified Astrologers'
    : filterParam === 'featured' ? 'Featured Astrologers'
    : 'All Astrologers';

  // Which box the deep link targets: online → Live, pending → Pending,
  // verified/featured/all → the All box.
  const target =
    filterParam === 'online' ? 'live'
    : filterParam === 'pending' ? 'pending'
    : (filterParam === 'verified' || filterParam === 'featured' || filterParam === 'all') ? 'all'
    : null;

  // Auto-open the matching collapsible box (mobile) and scroll to it.
  useEffect(() => {
    if (!target || loading) return;
    const id = target === 'live' ? 'astro-box-live' : target === 'pending' ? 'astro-box-pending' : 'astro-box-all';
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [target, loading]);

  return (
    <div>
      <div className="uat-head">
        <div>
          <h1 style={{ marginBottom: 2 }}>Astrologer Management</h1>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Live, all, and pending — onboard, approve and manage real &amp; AI astrologers.</p>
        </div>
        <button className="btn" onClick={() => setShowAdd(true)}>+ Add New Astrologer</button>
      </div>

      {loading ? <p className="muted" style={{ marginTop: 16 }}>Loading…</p> : (
        <div className="cust3">
          <MobileSection title="Live Astrologers" defaultOpen={target ? target === 'live' : true}>
            <AstroBox domId="astro-box-live" title="Live Astrologers" icon="🟢" accent="#3cb371" list={live} showLiveDot
              isSuper={isSuper} busy={busy} actions={['view', 'edit']} onStatus={setStatus} onEditRate={setEditing} />
          </MobileSection>
          <MobileSection title={allTitle} defaultOpen={target === 'all'}>
            <AstroBox domId="astro-box-all" title={allTitle} icon="📋" accent="var(--primary)" list={allList}
              isSuper={isSuper} busy={busy} actions={['view', 'edit']} onStatus={setStatus} onEditRate={setEditing} />
          </MobileSection>
          <MobileSection title="Pending Approvals" defaultOpen={target === 'pending'}>
            <AstroBox domId="astro-box-pending" title="Pending Approvals" icon="🕐" accent="var(--gold)" list={pending}
              isSuper={isSuper} busy={busy} actions={['view', 'approve']} onStatus={setStatus} onEditRate={setEditing} />
          </MobileSection>
        </div>
      )}

      {showAdd && <AstrologerFormModal mode="create" isSuper={isSuper} onClose={() => setShowAdd(false)} />}
      {editing && <AstrologerFormModal mode="edit" isSuper={isSuper} astrologer={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export default function AstrologersPage() {
  // useSearchParams() requires a Suspense boundary in the Next.js app router.
  return (
    <Suspense fallback={<p className="muted" style={{ marginTop: 16 }}>Loading…</p>}>
      <AstrologersManagement />
    </Suspense>
  );
}
