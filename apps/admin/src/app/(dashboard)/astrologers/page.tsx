'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCollection, callFn, Row } from '@/lib/hooks';
import { useAuth } from '@/lib/auth-context';
import { AstrologerFormModal } from '@/components/AstrologerFormModal';

const PAGE_OPTIONS = [10, 100, 500, 1000];

const STATUS_COLORS: Record<string, string> = {
  approved: 'green', pending: 'amber', suspended: 'red', rejected: 'red', disabled: 'red',
};
const rupees = (paise: unknown) => (typeof paise === 'number' ? paise / 100 : null);

type BoxAction = 'view' | 'edit' | 'approve';

function AstroBox({
  title, icon, accent, list, isSuper, busy, actions, showLiveDot, onStatus, onEditRate,
}: {
  title: string; icon: string; accent: string; list: Row[];
  isSuper: boolean; busy: string | null; actions: BoxAction[]; showLiveDot?: boolean;
  onStatus: (id: string, status: string, name?: string) => void; onEditRate: (a: Row) => void;
}) {
  const [limit, setLimit] = useState(10);
  const shown = list.slice(0, limit);
  return (
    <div className="card custcard" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="sess-col-head">
        <h3 className="celeste" style={{ margin: 0, fontSize: 16 }}>{icon} {title}</h3>
        <span className="udet-total">{list.length}</span>
      </div>
      <div className="custlist">
        {shown.length === 0 ? <p className="drawer-muted" style={{ margin: '10px 0' }}>Nothing here yet.</p> : shown.map((a) => {
          const rate = rupees(a.ratePerMinutePaise);
          const st = (a.accountStatus ?? 'pending') as string;
          return (
            <div key={a.id} className="custrow">
              <div style={{ minWidth: 0 }}>
                <span className="nm">
                  {showLiveDot && a.onlineStatus ? <span className="live-dot" style={{ marginRight: 6 }} /> : null}
                  {a.name || 'Unnamed'}
                  {a.verified ? ' ✓' : ''}
                  {a.isAI ? <span className="badge purple" style={{ marginLeft: 6, fontSize: 10 }}>AI</span> : null}
                </span>
                <span className="ph">
                  {rate != null ? `₹${rate}/min` : 'default rate'} · <span className={`badge ${STATUS_COLORS[st] ?? ''}`} style={{ fontSize: 10 }}>{st}</span>
                </span>
              </div>
              <div className="custrow-right" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {actions.includes('view') && <Link href={`/astrologers/${a.id}`} className="btn sm secondary">View</Link>}
                {actions.includes('edit') && <button className="btn sm secondary" disabled={busy === a.id} onClick={() => onEditRate(a)}>✎ Edit</button>}
                {actions.includes('approve') && isSuper && (
                  <>
                    <button className="btn sm" disabled={busy === a.id} onClick={() => onStatus(a.id, 'approved')}>✓</button>
                    <button className="btn sm danger" disabled={busy === a.id} onClick={() => { if (confirm(`Reject ${a.name}?`)) onStatus(a.id, 'rejected'); }}>✕</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="custfoot">
        <span className="muted">Showing {Math.min(limit, list.length)} of {list.length}</span>
        <label className="muted">Rows
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

export default function AstrologersPage() {
  const { rows, loading } = useCollection('astrologers');
  const { adminRole } = useAuth();
  const isSuper = adminRole === 'super';
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setBusy(id);
    try { await callFn('setAstrologerStatus', { astrologerId: id, status }); }
    catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(null); }
  }

  const live = rows.filter((a: Row) => a.onlineStatus === true);
  const pending = rows.filter((a: Row) => (a.accountStatus ?? 'pending') === 'pending');

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
          <AstroBox title="Live Astrologers" icon="🟢" accent="#3cb371" list={live} showLiveDot
            isSuper={isSuper} busy={busy} actions={['view', 'edit']} onStatus={setStatus} onEditRate={setEditing} />
          <AstroBox title="All Astrologers" icon="📋" accent="var(--primary)" list={rows}
            isSuper={isSuper} busy={busy} actions={['view', 'edit']} onStatus={setStatus} onEditRate={setEditing} />
          <AstroBox title="Pending Approvals" icon="🕐" accent="var(--gold)" list={pending}
            isSuper={isSuper} busy={busy} actions={['view', 'approve']} onStatus={setStatus} onEditRate={setEditing} />
        </div>
      )}

      {showAdd && <AstrologerFormModal mode="create" isSuper={isSuper} onClose={() => setShowAdd(false)} />}
      {editing && <AstrologerFormModal mode="edit" isSuper={isSuper} astrologer={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
