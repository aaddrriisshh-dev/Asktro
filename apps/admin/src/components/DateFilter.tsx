'use client';

import { useState } from 'react';
import { Preset, PRESETS } from '@/lib/dateRange';

/** Compact date-range chip + dropdown used on every dashboard card. */
export function DateFilter({
  preset,
  custom,
  onPreset,
  onCustom,
}: {
  preset: Preset;
  custom: { start?: string; end?: string };
  onPreset: (p: Preset) => void;
  onCustom: (c: { start?: string; end?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = PRESETS.find((p) => p.key === preset)?.label ?? 'Filter';

  return (
    <div className="dfilter" onClick={(e) => e.stopPropagation()}>
      <button className="dfilter-chip" onClick={() => setOpen((o) => !o)}>
        {label}
        <span className="dfilter-caret">▾</span>
      </button>
      {open && (
        <>
          <div className="dfilter-backdrop" onClick={() => setOpen(false)} />
          <div className="dfilter-menu">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                className={`dfilter-item${preset === p.key ? ' active' : ''}`}
                onClick={() => {
                  onPreset(p.key);
                  if (p.key !== 'custom') setOpen(false);
                }}
              >
                {p.label}
              </button>
            ))}
            {preset === 'custom' && (
              <div className="dfilter-custom">
                <label>From (date &amp; time)</label>
                <input
                  type="datetime-local"
                  value={custom.start ?? ''}
                  onChange={(e) => onCustom({ ...custom, start: e.target.value })}
                />
                <label>To (date &amp; time)</label>
                <input
                  type="datetime-local"
                  value={custom.end ?? ''}
                  onChange={(e) => onCustom({ ...custom, end: e.target.value })}
                />
                <button className="btn sm" onClick={() => setOpen(false)}>
                  Apply
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
