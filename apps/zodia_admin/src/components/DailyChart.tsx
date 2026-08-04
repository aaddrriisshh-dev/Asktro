'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

/** Shared daily time-series area chart for the analytics drawers. */
export function DailyChart({
  data,
  color,
  name,
  money,
}: {
  data: { day: string; value: number }[];
  color: string;
  name: string;
  money?: boolean; // values are rupees when true, plain counts otherwise
}) {
  const id = 'g' + color.replace(/[^a-z0-9]/gi, '');
  const fmt = (v: number) => (money ? `₹${v.toLocaleString('en-IN')}` : v.toLocaleString('en-IN'));

  if (data.length === 0) {
    return <p className="drawer-muted">No data in this period.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#efeafc" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9891c2' }} stroke="#e7e1f5" />
        <YAxis tick={{ fontSize: 11, fill: '#9891c2' }} stroke="#e7e1f5" allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: '#fff', border: '1px solid #e6edf7', borderRadius: 10, color: '#141c38' }}
          formatter={(v: number) => [fmt(v), name]}
        />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${id})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
