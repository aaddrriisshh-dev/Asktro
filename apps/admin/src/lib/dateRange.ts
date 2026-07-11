/** Shared date-range presets for dashboard cards. All ranges are [start, end). */
export type Preset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'prevMonth'
  | 'allTime'
  | 'custom';

export const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 Days' },
  { key: 'last30', label: 'Last 30 Days' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'prevMonth', label: 'Previous Month' },
  { key: 'allTime', label: 'All Time' },
  { key: 'custom', label: 'Custom Range' },
];

export interface Range {
  start: number; // ms inclusive
  end: number; // ms exclusive
  label: string;
}

const DAY = 86_400_000;
// Day boundaries are computed in UTC so they align exactly with the backend's
// UTC timestamps and the per-UTC-day dailyStats rollup markers. (A local-midnight
// boundary in a non-UTC zone like IST straddles two UTC days and off-by-one'd the
// rollup-backed cards.) "Today" therefore means the current UTC day.
function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function resolveRange(preset: Preset, custom?: { start?: string; end?: string }): Range {
  const now = new Date();
  const t0 = startOfUtcDay(now);
  switch (preset) {
    case 'today':
      return { start: t0, end: t0 + DAY, label: 'Today' };
    case 'yesterday':
      return { start: t0 - DAY, end: t0, label: 'Yesterday' };
    case 'last7':
      return { start: t0 - 6 * DAY, end: t0 + DAY, label: 'Last 7 Days' };
    case 'last30':
      return { start: t0 - 29 * DAY, end: t0 + DAY, label: 'Last 30 Days' };
    case 'thisMonth': {
      const s = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
      const e = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
      return { start: s, end: e, label: 'This Month' };
    }
    case 'prevMonth': {
      const s = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
      const e = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
      return { start: s, end: e, label: 'Previous Month' };
    }
    case 'allTime':
      // everything from the epoch through the end of the current UTC day
      return { start: 0, end: t0 + DAY, label: 'All Time' };
    case 'custom': {
      // custom supports full date + time (datetime-local values).
      const s = custom?.start ? new Date(custom.start).getTime() : t0;
      const e = custom?.end ? new Date(custom.end).getTime() : t0 + DAY;
      return { start: s, end: e > s ? e : s + DAY, label: 'Custom' };
    }
  }
}
