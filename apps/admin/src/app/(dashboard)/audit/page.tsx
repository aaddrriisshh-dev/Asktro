'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { orderBy, limit } from 'firebase/firestore';
import { useCollection, useNamesByIds, callFn, Row } from '@/lib/hooks';
import { DateFilter } from '@/components/DateFilter';
import { Preset, resolveRange } from '@/lib/dateRange';
import { formatDate } from '@/lib/format';
import { downloadCSV } from '@/lib/csv';

/* ---------- action taxonomy for the ASKTRO ecosystem ---------- */
type Cat = 'astrologer' | 'money' | 'user' | 'content' | 'admin' | 'support';
interface Meta { cat: Cat; color: string; verb: string }

function classify(action: string): Meta {
  const a = action || '';
  // Astrologer world
  if (a === 'createAstrologer') return { cat: 'astrologer', color: 'purple', verb: 'onboarded astrologer' };
  if (a === 'updateAstrologer') return { cat: 'astrologer', color: 'amber', verb: 'updated astrologer' };
  if (a === 'deleteAstrologer') return { cat: 'astrologer', color: 'red', verb: 'deleted astrologer' };
  if (a === 'astrologer_approved') return { cat: 'astrologer', color: 'green', verb: 'approved astrologer' };
  if (a === 'astrologer_rejected') return { cat: 'astrologer', color: 'red', verb: 'rejected astrologer' };
  if (a === 'astrologer_suspended') return { cat: 'astrologer', color: 'red', verb: 'suspended astrologer' };
  if (a.startsWith('astrologer_')) return { cat: 'astrologer', color: 'green', verb: `set astrologer ${a.slice(11)}` };
  // Money
  if (a === 'creditWallet') return { cat: 'money', color: 'green', verb: 'credited wallet' };
  if (a === 'debitWallet') return { cat: 'money', color: 'red', verb: 'debited wallet' };
  if (a === 'payout_approved') return { cat: 'money', color: 'green', verb: 'approved payout' };
  if (a === 'payout_rejected') return { cat: 'money', color: 'red', verb: 'rejected payout' };
  if (a.startsWith('payout_')) return { cat: 'money', color: 'amber', verb: `payout ${a.slice(7)}` };
  if (a === 'devSimulateRecharge') return { cat: 'money', color: 'amber', verb: 'simulated a recharge' };
  // Users
  if (a === 'deleteAccount') return { cat: 'user', color: 'red', verb: 'deleted account' };
  if (a === 'setUserRole') return { cat: 'user', color: 'purple', verb: 'changed user role' };
  if (a.startsWith('user_')) return { cat: 'user', color: a.includes('active') ? 'green' : 'red', verb: `set user ${a.slice(5)}` };
  // Content
  if (a === 'sendBroadcast') return { cat: 'content', color: 'blue', verb: 'sent a broadcast' };
  // Admin & roles
  if (a === 'createAdmin') return { cat: 'admin', color: 'purple', verb: 'created an admin' };
  if (a === 'setAdminRole') return { cat: 'admin', color: 'purple', verb: 'changed an admin role' };
  if (a === 'removeAdmin') return { cat: 'admin', color: 'red', verb: 'removed an admin' };
  // Support
  if (a === 'support_reply') return { cat: 'support', color: 'blue', verb: 'replied to a ticket' };
  if (a === 'support_close') return { cat: 'support', color: 'amber', verb: 'closed a ticket' };
  if (a === 'support_reopen') return { cat: 'support', color: 'green', verb: 'reopened a ticket' };
  return { cat: 'content', color: 'amber', verb: a.replace(/_/g, ' ') };
}

const CAT_LABEL: Record<Cat, string> = {
  astrologer: 'Astrologers', money: 'Money', user: 'Users', content: 'Content', admin: 'Admins & Roles', support: 'Support',
};
const CAT_ICON: Record<Cat, string> = {
  astrologer: '✦', money: '₹', user: '👤', content: '📣', admin: '🛡', support: '💬',
};
const SENSITIVE = new Set(['astrologer_approved', 'astrologer_rejected', 'payout_approved', 'payout_rejected',
  'createAdmin', 'setAdminRole', 'removeAdmin', 'deleteAccount', 'deleteAstrologer', 'setUserRole']);

const targetHref = (t?: string, id?: string): string | null => {
  if (!id) return null;
  switch (t) {
    case 'astrologer': return `/astrologers/${id}`;
    case 'user': return `/users/${id}`;
    case 'payout': return '/payouts';
    case 'ticket': return '/support';
    case 'admin': return '/admins';
    case 'segment': return '/broadcast';
    default: return null;
  }
};

const ms = (t: { toMillis?: () => number } | undefined) => t?.toMillis?.() ?? 0;
function relTime(m: number): string {
  if (!m) return '';
  const s = Math.floor((Date.now() - m) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}
function dayKey(m: number): string {
  const d = new Date(m);
  const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, y)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}


function Stat({ color, icon, label, value, foot, onClick, active }: { color: string; icon: string; label: string; value: string; foot?: string; onClick?: () => void; active?: boolean }) {
  return (
    <div
      className={`stat c-${color}`}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer', outline: active ? '2px solid var(--primary)' : undefined, outlineOffset: 2 } : undefined}
      title={onClick ? 'Click to filter the activity below' : undefined}
    >
      <div className="stat__label"><span className="stat__icon" style={{ fontSize: 15 }}>{icon}</span>{label}</div>
      <div className="stat__value">{value}</div>
      {foot && <div className="stat__foot"><span className="stat__pill">{foot}</span></div>}
    </div>
  );
}

function AuditRow({ r, resolve }: { r: Row; resolve?: (id: unknown) => string }) {
  const [open, setOpen] = useState(false);
  const action = String(r.action ?? '');
  const meta = classify(action);
  const when = ms(r.createdAt);
  // WHO did it: stored name → resolved actor name (admin/astrologer/customer) → 'Admin'.
  const actor = (r.actorName as string)?.trim() || resolve?.(r.actorUid) || 'Admin';
  const role = (r.actorRole as string) || '';
  const href = targetHref(String(r.targetType ?? ''), String(r.targetId ?? ''));
  const tId = String(r.targetId ?? '');
  // TO WHOM: captured name (deletions) → resolved name → raw UID.
  const tName = String(r.targetName ?? '').trim() || (resolve?.(tId) ?? '') || '';
  const tLabel = tName || tId.slice(0, 14);
  const reason = String(r.reason ?? '').trim();
  const detail = (r.after ?? r.before) as Record<string, unknown> | undefined;
  return (
    <div className={`auditrow${open ? ' open' : ''}`} onClick={() => setOpen((v) => !v)}>
      <span className={`audit-cat c-${meta.color}`}>{CAT_ICON[meta.cat]}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="audit-line">
          <b>{actor}</b> {meta.verb}
          {href ? <Link href={href} className="audit-target" onClick={(e) => e.stopPropagation()}>{tLabel || 'view'}</Link>
            : tLabel ? <span className="audit-target plain">{tLabel}</span> : null}
          {SENSITIVE.has(action) && <span className="badge red" style={{ fontSize: 10, marginLeft: 6 }}>sensitive</span>}
        </div>
        <div className="audit-sub">
          {role && <span className="badge purple" style={{ fontSize: 10 }}>{role}</span>}
          <span className="muted" style={{ fontSize: 11.5 }}>{formatDate(when)}</span>
          {reason && <span className="muted" style={{ fontSize: 11.5 }}>· reason: “{reason}”</span>}
        </div>
        {open && detail && (
          <div className="audit-json" onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gap: 4 }}>
            {Object.entries(detail).map(([k, v]) => {
              const isId = /id$/i.test(k) && typeof v === 'string';
              const nm = isId ? (resolve?.(v) ?? '') : '';
              const display = Array.isArray(v) ? v.join(', ')
                : v && typeof v === 'object' ? JSON.stringify(v)
                  : String(v);
              return (
                <div key={k} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10 }}>
                  <span className="muted">{k}</span>
                  <span style={{ wordBreak: 'break-word' }}>{nm ? `${nm} (${String(v).slice(0, 8)}…)` : display}</span>
                </div>
              );
            })}
          </div>
        )}
        {open && (
          <div className="audit-meta">
            <span className="muted">action</span><code>{action}</code>
            <span className="muted">actor uid</span><code>{String(r.actorUid ?? '—')}</code>
            <span className="muted">target</span><code>{String(r.targetType ?? '—')} · {tName ? `${tName} (${tId.slice(0, 8)}…)` : (tId || '—')}</code>
          </div>
        )}
      </div>
      <span className="audit-when">{relTime(when)}</span>
    </div>
  );
}

export default function AuditPage() {
  const { rows, loading } = useCollection('auditLogs', [orderBy('createdAt', 'desc'), limit(500)]);
  // Resolve every UID shown (actors AND targets) → real names, so the log reads
  // "Adrish processed payout → Lakshmi Iyer" instead of codes. We check admins,
  // astrologers and customers; whichever matches wins.
  // Every UID we might show: actor, user/astrologer targets, AND id-like fields
  // nested in the detail (e.g. a payout's astrologerId) so those resolve too.
  const nestedIds = (r: Row): string[] => {
    const d = (r.after ?? r.before) as Record<string, unknown> | undefined;
    if (!d || typeof d !== 'object') return [];
    return Object.entries(d)
      .filter(([k, v]) => /id$/i.test(k) && typeof v === 'string')
      .map(([, v]) => String(v));
  };
  const allIds = rows.flatMap((r) => [
    String(r.actorUid ?? ''),
    r.targetType === 'user' || r.targetType === 'astrologer' ? String(r.targetId ?? '') : '',
    ...nestedIds(r),
  ]);
  const userNames = useNamesByIds('users', allIds);
  const astroNames = useNamesByIds('astrologers', allIds);
  const [adminMap, setAdminMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    callFn<{ admins?: { uid: string; name?: string; email?: string }[] }>('listAdmins', {})
      .then((res) => setAdminMap(new Map((res.admins ?? []).map((a) => [a.uid, (a.name || a.email || '').trim()]))))
      .catch(() => { /* non-super-admins can't list; fall back to UID/'Admin' */ });
  }, []);
  const resolve = (id: unknown) => {
    const s = String(id ?? '');
    if (!s) return '';
    return adminMap.get(s) || astroNames.get(s) || userNames.get(s) || '';
  };
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'all' | Cat>('all');
  const [preset, setPreset] = useState<Preset>('last7');
  const [custom, setCustom] = useState<{ start?: string; end?: string }>({});
  const [actor, setActor] = useState('all');
  const [special, setSpecial] = useState<'none' | 'sensitive' | 'payout'>('none');
  const isPayout = (action: string) => /payout/i.test(action);

  const admins = useMemo(() => Array.from(new Set(rows.map((r) => (r.actorName as string) || 'Admin'))).sort(), [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const range = resolveRange(preset, custom);
    return rows.filter((r) => {
      const t = ms(r.createdAt);
      if (t < range.start || t >= range.end) return false;
      if (cat !== 'all' && classify(String(r.action ?? '')).cat !== cat) return false;
      if (actor !== 'all' && ((r.actorName as string) || 'Admin') !== actor) return false;
      if (special === 'sensitive' && !SENSITIVE.has(String(r.action ?? ''))) return false;
      if (special === 'payout' && !isPayout(String(r.action ?? ''))) return false;
      if (s && ![r.action, r.actorName, r.actorUid, r.targetType, r.targetId].some((v) => String(v ?? '').toLowerCase().includes(s))) return false;
      return true;
    });
  }, [rows, q, cat, preset, custom, actor, special]);

  const kpis = useMemo(() => {
    const now = Date.now();
    const today = rows.filter((r) => now - ms(r.createdAt) < 24 * 3600e3);
    const week = rows.filter((r) => now - ms(r.createdAt) < 7 * 24 * 3600e3);
    const sensitive = week.filter((r) => SENSITIVE.has(String(r.action ?? '')));
    const money = week.filter((r) => classify(String(r.action ?? '')).cat === 'money');
    const payout = rows.filter((r) => isPayout(String(r.action ?? ''))); // all-time; payouts are rare
    const byAdmin = new Map<string, number>();
    week.forEach((r) => { const n = (r.actorName as string) || 'Admin'; byAdmin.set(n, (byAdmin.get(n) ?? 0) + 1); });
    const top = [...byAdmin.entries()].sort((a, b) => b[1] - a[1])[0];
    return { today: today.length, week: week.length, sensitive: sensitive.length, money: money.length, payout: payout.length, top };
  }, [rows]);

  // Is a card-driven filter active? (used to show a clear "showing X" banner)
  const cardActive = special !== 'none' || cat !== 'all' || actor !== 'all';
  const clearCard = () => { setSpecial('none'); setCat('all'); setActor('all'); };

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    filtered.forEach((r) => {
      const k = dayKey(ms(r.createdAt));
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    });
    return [...map.entries()];
  }, [filtered]);

  function exportCsv() {
    downloadCSV<Row>('audit_log.csv', filtered, [
      { label: 'When', value: (r) => formatDate(ms(r.createdAt)) },
      { label: 'Admin', value: (r) => (r.actorName as string) || 'Admin' },
      { label: 'Role', value: (r) => String(r.actorRole ?? '') },
      { label: 'Action', value: (r) => String(r.action ?? '') },
      { label: 'Target', value: (r) => `${r.targetType ?? ''}:${r.targetId ?? ''}` },
      { label: 'Actor UID', value: (r) => String(r.actorUid ?? '') },
    ]);
  }

  const CATS: ('all' | Cat)[] = ['all', 'astrologer', 'money', 'user', 'content', 'admin', 'support'];

  return (
    <div>
      <div className="uat-head">
        <div>
          <h1 style={{ marginBottom: 2 }}>Audit Log</h1>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Every privileged action across the ecosystem — who did it, to what, and when.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" style={{ maxWidth: 240 }} placeholder="Search action, admin, target…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn sm secondary" onClick={exportCsv}>⬇ Export</button>
        </div>
      </div>

      {/* KPI panel — tap a card to see those exact records below */}
      <div className="grid dashgrid" style={{ marginTop: 16 }}>
        <Stat color="gold" icon="⚡" label="Actions today" value={String(kpis.today)} foot="last 24h · tap to view"
          onClick={() => { setPreset('today'); setCat('all'); setSpecial('none'); setActor('all'); }} active={preset === 'today' && !cardActive} />
        <Stat color="purple" icon="🗓" label="Actions this week" value={String(kpis.week)} foot="last 7 days · tap to view"
          onClick={() => { setPreset('last7'); setCat('all'); setSpecial('none'); setActor('all'); }} active={preset === 'last7' && !cardActive} />
        <Stat color="rose" icon="🛡" label="Sensitive actions" value={String(kpis.sensitive)} foot="roles · deletes · payouts · tap to view"
          onClick={() => { setSpecial('sensitive'); setPreset('last7'); setCat('all'); setActor('all'); }} active={special === 'sensitive'} />
        <Stat color="green" icon="₹" label="Money actions" value={String(kpis.money)} foot="credits · debits · refunds · tap to view"
          onClick={() => { setCat('money'); setPreset('last7'); setSpecial('none'); setActor('all'); }} active={cat === 'money' && special === 'none'} />
        <Stat color="amber" icon="💸" label="Payouts" value={String(kpis.payout)} foot="all time · tap to view"
          onClick={() => { setSpecial('payout'); setPreset('allTime'); setCat('all'); setActor('all'); }} active={special === 'payout'} />
        <Stat color="blue" icon="👑" label="Most active admin" value={kpis.top ? kpis.top[0] : '—'} foot={kpis.top ? `${kpis.top[1]} actions · tap to view` : 'this week'}
          onClick={() => { if (kpis.top) { setActor(kpis.top[0]); setPreset('last7'); setSpecial('none'); setCat('all'); } }} active={!!kpis.top && actor === kpis.top[0]} />
      </div>

      {/* Filters */}
      <div className="card" style={{ marginTop: 16, padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="pickrow">
            {CATS.map((c) => (
              <button key={c} type="button" className={`pickchip${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>
                {c === 'all' ? 'All' : `${CAT_ICON[c as Cat]} ${CAT_LABEL[c as Cat]}`}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="input" style={{ width: 'auto' }} value={actor} onChange={(e) => setActor(e.target.value)}>
              <option value="all">All admins</option>
              {admins.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <DateFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} />
          </div>
        </div>
      </div>

      {/* Activity feed, grouped by day */}
      <div className="card sess-col" style={{ marginTop: 16 }}>
        <div className="sess-col-head">
          <h3 className="celeste" style={{ margin: 0 }}>🕘 Activity</h3>
          <span className="udet-total">{filtered.length} shown</span>
        </div>
        {cardActive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', flexWrap: 'wrap' }}>
            <span className="badge purple" style={{ fontSize: 11 }}>
              Showing: {special === 'sensitive' ? 'Sensitive actions' : special === 'payout' ? 'Payouts' : cat !== 'all' ? `${CAT_LABEL[cat as Cat]} actions` : actor !== 'all' ? `${actor}'s actions` : 'filtered'}
              {' '}· {filtered.length} record{filtered.length === 1 ? '' : 's'}
            </span>
            <button className="btn sm secondary" onClick={clearCard}>Clear</button>
          </div>
        )}
        {loading ? <p className="muted" style={{ padding: 12 }}>Loading…</p> : groups.length === 0 ? (
          <p className="muted" style={{ padding: 12 }}>No actions match these filters.</p>
        ) : (
          <div className="audit-feed">
            {groups.map(([day, list]) => (
              <div key={day}>
                <div className="audit-day">{day}<span className="muted"> · {list.length}</span></div>
                {list.map((r) => <AuditRow key={r.id} r={r} resolve={resolve} />)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
