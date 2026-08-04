/** Horizontal proportion bar with a legend — for roster splits (no time axis). */
export function BarBreakdown({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="barbd">
      <div className="barbd-track">
        {segments.map((s, i) => (
          <div key={i} className="barbd-seg" style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div className="barbd-legend">
        {segments.map((s, i) => (
          <span key={i}>
            <i style={{ background: s.color }} />
            {s.label} · <strong>{s.value.toLocaleString('en-IN')}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
