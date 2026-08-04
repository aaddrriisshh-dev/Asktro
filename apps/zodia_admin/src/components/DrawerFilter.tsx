'use client';

import { Preset, PRESETS } from '@/lib/dateRange';

/** Full date + time range picker shown inside a card's analytics drawer. */
export function DrawerFilter({
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
  return (
    <div className="dfil">
      <div className="dfil-presets">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className={`dfil-chip${preset === p.key ? ' active' : ''}`}
            onClick={() => onPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="dfil-custom">
          <label>
            From — date &amp; time
            <input
              type="datetime-local"
              value={custom.start ?? ''}
              onChange={(e) => onCustom({ ...custom, start: e.target.value })}
            />
          </label>
          <label>
            To — date &amp; time
            <input
              type="datetime-local"
              value={custom.end ?? ''}
              onChange={(e) => onCustom({ ...custom, end: e.target.value })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
