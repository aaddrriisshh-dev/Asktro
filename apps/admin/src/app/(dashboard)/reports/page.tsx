'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';

// Hard cap so the reports page can never buffer millions of docs into the tab
// (the audit's OOM finding). Exports beyond this need a server-side CSV job
// (10k→50k refinement); the on-screen KPIs are based on up to this many rows.
const REPORT_CAP = 10000;
import { db } from '@/lib/firebase';
import { formatPaise, shortDay } from '@/lib/format';
import { useCardFilter } from '@/lib/useCardFilter';
import { DrawerFilter } from '@/components/DrawerFilter';
import { downloadCSV, downloadXLS, tsCell, rupeeCell, Col } from '@/lib/csv';
import { MobileSection } from '@/components/MobileSection';

type Any = Record<string, unknown>;
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const msOf = (t: Any, k: string) => (t[k] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
const TYPE_COLORS: Record<string, string> = { chat: '#7e5bd0', voice: '#3f8fd0', video: '#d06a9c' };

interface ReportData {
  gross: number; refunds: number; net: number; rechargeCount: number;
  consCount: number; minutes: number; newUsers: number; paidOut: number;
  daily: { day: string; revenue: number }[];
  byType: { type: string; count: number }[];
}

interface ExportSpec {
  name: string; label: string; desc: string; count: number;
  source: Any[] | (() => Promise<Any[]>);
  cols: Col<Any>[];
}

export default function ReportsPage() {
  const { preset, setPreset, custom, setCustom, range } = useCardFilter('reports', 'last30');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [txns, setTxns] = useState<Any[]>([]);
  const [cons, setCons] = useState<Any[]>([]);
  const [users, setUsers] = useState<Any[]>([]);
  const [payouts, setPayouts] = useState<Any[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const inRange = (coll: string) => getDocs(query(
        collection(db, coll),
        where('createdAt', '>=', Timestamp.fromMillis(range.start)),
        where('createdAt', '<', Timestamp.fromMillis(range.end)),
        orderBy('createdAt', 'desc'),
        limit(REPORT_CAP),
      ));
      const [txnSnap, consSnap, userSnap, poSnap] = await Promise.all([
        inRange('walletTransactions'), inRange('consultations'), inRange('users'), inRange('payouts'),
      ]);
      if (cancelled) return;
      const t = txnSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Any[];
      const c = consSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Any[];
      const u = userSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Any[];
      const p = poSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Any[];
      setTxns(t); setCons(c); setUsers(u); setPayouts(p);

      const recharge = t.filter((x) => x.kind === 'recharge');
      const gross = recharge.reduce((n, x) => n + ((x.amount as number) ?? 0), 0);
      const refunds = t.filter((x) => x.kind === 'refund').reduce((n, x) => n + Math.abs((x.amount as number) ?? 0), 0);
      const byDay = new Map<string, number>();
      recharge.forEach((x) => {
        const k = dayKey(msOf(x, 'createdAt') || range.start);
        byDay.set(k, (byDay.get(k) ?? 0) + ((x.amount as number) ?? 0));
      });
      const typeCount: Record<string, number> = { chat: 0, voice: 0, video: 0 };
      c.forEach((x) => { const ty = (x.type as string) ?? 'chat'; if (ty in typeCount) typeCount[ty] += 1; });

      if (!cancelled) {
        setData({
          gross, refunds, net: gross - refunds, rechargeCount: recharge.length,
          consCount: c.length,
          minutes: Math.round(c.reduce((n, x) => n + ((x.billedSeconds as number) ?? 0), 0) / 60),
          newUsers: u.length,
          paidOut: p.filter((x) => x.status === 'processed').reduce((n, x) => n + ((x.amount as number) ?? 0), 0),
          daily: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, revenue]) => ({ day: shortDay(day), revenue: Math.round(revenue / 100) })),
          byType: Object.entries(typeCount).map(([type, count]) => ({ type, count })),
        });
        setLoading(false);
      }
    })().catch(() => { if (!cancelled) { setData(null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [range.start, range.end]);

  async function runExport(e: ExportSpec, fmt: 'csv' | 'xls') {
    const key = e.name + fmt;
    setDownloading(key);
    try {
      const rows = typeof e.source === 'function' ? await e.source() : e.source;
      const fn = `asktro_${e.name}_${new Date().toISOString().slice(0, 10)}`;
      if (fmt === 'csv') downloadCSV(fn + '.csv', rows, e.cols);
      else downloadXLS(fn + '.xls', rows, e.cols);
    } catch (err) { alert('Export failed: ' + (err as Error).message); }
    finally { setDownloading(null); }
  }

  const fetchAll = (coll: string) => async (): Promise<Any[]> => {
    const snap = await getDocs(query(collection(db, coll), limit(REPORT_CAP)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Any[];
  };

  // Astrologer money (earnings/pendingPayout/commissionPercent) now lives in the
  // admin-readable private/financials subdoc, off the public directory doc. Merge
  // it per-astrologer for the export.
  const fetchAstrologers = async (): Promise<Any[]> => {
    const snap = await getDocs(collection(db, 'astrologers'));
    return Promise.all(
      snap.docs.map(async (d) => {
        const fin = await getDoc(doc(db, 'astrologers', d.id, 'private', 'financials'));
        return { id: d.id, ...d.data(), ...(fin.exists() ? fin.data() : {}) } as Any;
      }),
    );
  };

  const kpis = data ? [
    { k: 'Gross Revenue', v: formatPaise(data.gross) },
    { k: 'Net Revenue', v: formatPaise(data.net) },
    { k: 'Recharges', v: data.rechargeCount.toLocaleString('en-IN') },
    { k: 'Consultations', v: data.consCount.toLocaleString('en-IN') },
    { k: 'Minutes Billed', v: data.minutes.toLocaleString('en-IN') },
    { k: 'New Users', v: data.newUsers.toLocaleString('en-IN') },
    { k: 'Refunds', v: formatPaise(data.refunds) },
    { k: 'Paid to Astrologers', v: formatPaise(data.paidOut) },
  ] : [];

  const EXPORTS: ExportSpec[] = [
    { name: 'new_users', label: 'New users (range)', desc: 'Signups in range', count: users.length, source: users, cols: [
      { label: 'Name', value: (r) => r.name as string }, { label: 'Phone', value: (r) => r.phone as string },
      { label: 'Gender', value: (r) => r.gender as string }, { label: 'Wallet', value: (r) => rupeeCell(r.walletBalance) },
      { label: 'Total recharged', value: (r) => rupeeCell(r.totalRecharge) }, { label: 'Status', value: (r) => r.accountStatus as string },
      { label: 'Joined', value: (r) => tsCell(r.createdAt as never) }] },
    { name: 'consultations', label: 'Consultations (range)', desc: 'Sessions in range', count: cons.length, source: cons, cols: [
      { label: 'ID', value: (r) => r.id as string }, { label: 'Type', value: (r) => r.type as string },
      { label: 'Customer', value: (r) => r.customerId as string }, { label: 'Astrologer', value: (r) => r.astrologerId as string },
      { label: 'Minutes', value: (r) => Math.round(((r.billedSeconds as number) ?? 0) / 60 * 10) / 10 },
      { label: 'Charged', value: (r) => rupeeCell(r.totalCharged) }, { label: 'Status', value: (r) => r.status as string },
      { label: 'Date', value: (r) => tsCell(r.createdAt as never) }] },
    { name: 'transactions', label: 'Wallet ledger (range)', desc: 'Money movements in range', count: txns.length, source: txns, cols: [
      { label: 'User', value: (r) => r.userId as string }, { label: 'Kind', value: (r) => r.kind as string },
      { label: 'Amount', value: (r) => rupeeCell(r.amount) }, { label: 'Balance after', value: (r) => rupeeCell(r.balanceAfter) },
      { label: 'Note', value: (r) => r.note as string }, { label: 'Date', value: (r) => tsCell(r.createdAt as never) }] },
    { name: 'payouts', label: 'Payouts (range)', desc: 'Payout requests in range', count: payouts.length, source: payouts, cols: [
      { label: 'Astrologer', value: (r) => (r.astrologerName as string) ?? (r.astrologerId as string) },
      { label: 'Amount', value: (r) => rupeeCell(r.amount) }, { label: 'Method', value: (r) => r.method as string },
      { label: 'Status', value: (r) => r.status as string }, { label: 'Date', value: (r) => tsCell(r.createdAt as never) }] },
    { name: 'all_users', label: 'All users', desc: 'Full customer list', count: -1, source: fetchAll('users'), cols: [
      { label: 'Name', value: (r) => r.name as string }, { label: 'Phone', value: (r) => r.phone as string },
      { label: 'Wallet', value: (r) => rupeeCell(r.walletBalance) }, { label: 'Bonus', value: (r) => rupeeCell(r.bonusBalance) },
      { label: 'Total recharged', value: (r) => rupeeCell(r.totalRecharge) }, { label: 'Status', value: (r) => r.accountStatus as string },
      { label: 'Joined', value: (r) => tsCell(r.createdAt as never) }] },
    { name: 'astrologers', label: 'All astrologers', desc: 'Full roster', count: -1, source: fetchAstrologers, cols: [
      { label: 'Name', value: (r) => r.name as string }, { label: 'AI', value: (r) => (r.isAI ? 'yes' : 'no') },
      { label: 'Rate/min', value: (r) => rupeeCell(r.ratePerMinutePaise) }, { label: 'Commission %', value: (r) => (r.commissionPercent as number) ?? '' },
      { label: 'Rating', value: (r) => (r.rating as number) ?? 0 }, { label: 'Earnings', value: (r) => rupeeCell(r.earnings) },
      { label: 'Pending payout', value: (r) => rupeeCell(r.pendingPayout) }, { label: 'Status', value: (r) => r.accountStatus as string }] },
    { name: 'coupons', label: 'Coupons', desc: 'All promo codes', count: -1, source: fetchAll('coupons'), cols: [
      { label: 'Code', value: (r) => r.code as string }, { label: 'Amount', value: (r) => rupeeCell(r.amount) },
      { label: 'Bonus', value: (r) => rupeeCell(r.bonus) }, { label: 'Audience', value: (r) => (r.audience as string) ?? 'all' },
      { label: 'Used', value: (r) => (r.usedCount as number) ?? 0 }, { label: 'Active', value: (r) => (r.active ? 'yes' : 'no') }] },
    { name: 'support', label: 'Support tickets', desc: 'All raised tickets', count: -1, source: fetchAll('supportTickets'), cols: [
      { label: 'Ticket', value: (r) => r.ticketNo as string }, { label: 'From', value: (r) => r.userName as string },
      { label: 'Subject', value: (r) => r.subject as string }, { label: 'Status', value: (r) => r.status as string },
      { label: 'Date', value: (r) => tsCell(r.createdAt as never) }] },
  ];

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Reports</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Business metrics and full data exports. Pick a range; download any dataset as CSV or Excel.</p>

      <MobileSection title="Reports & exports" defaultOpen={true}>
      <div className="card" style={{ marginTop: 16 }}>
        <DrawerFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} />
        <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>Showing: <b>{range.label}</b></p>
      </div>
      </MobileSection>

      {loading ? <p className="muted" style={{ marginTop: 16 }}>Crunching numbers…</p> : data && (
        <>
          <div className="aview-stats" style={{ marginTop: 16, gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {kpis.map((k) => (
              <div key={k.k} className="aview-stat"><div className="k">{k.k}</div><div className="v" style={{ fontSize: 20 }}>{k.v}</div></div>
            ))}
          </div>

          <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', gap: 16, marginTop: 16 }}>
            <div className="card">
              <h3 className="celeste" style={{ marginTop: 0 }}>Revenue over time (₹)</h3>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.daily} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
                    <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7e5bd0" stopOpacity={0.5} /><stop offset="100%" stopColor="#7e5bd0" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke="#efeafc" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9891c2' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#9891c2' }} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #ece4fb' }} />
                    <Area type="monotone" dataKey="revenue" stroke="#7e5bd0" strokeWidth={2} fill="url(#rev)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card">
              <h3 className="celeste" style={{ marginTop: 0 }}>Consultations by type</h3>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byType} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke="#efeafc" vertical={false} />
                    <XAxis dataKey="type" tick={{ fontSize: 11, fill: '#9891c2' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#9891c2' }} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #ece4fb' }} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {data.byType.map((e) => <Cell key={e.type} fill={TYPE_COLORS[e.type] ?? '#7e5bd0'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3 className="celeste" style={{ marginTop: 0 }}>⬇ Data exports</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Download any dataset as CSV or Excel — opens in Excel / Google Sheets.</p>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {EXPORTS.map((e) => (
                <div key={e.name} className="aview-stat" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div><div style={{ fontWeight: 700, fontSize: 14 }}>{e.label}</div><div className="muted" style={{ fontSize: 12 }}>{e.desc}{e.count >= 0 ? ` · ${e.count} rows` : ''}</div></div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn sm secondary" disabled={downloading === e.name + 'csv'} onClick={() => runExport(e, 'csv')}>{downloading === e.name + 'csv' ? '…' : 'CSV'}</button>
                    <button className="btn sm" disabled={downloading === e.name + 'xls'} onClick={() => runExport(e, 'xls')}>{downloading === e.name + 'xls' ? '…' : 'Excel'}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
