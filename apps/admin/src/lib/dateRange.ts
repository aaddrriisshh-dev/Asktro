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
// Asktro is India-only, so the business "day" is the INDIA (IST, UTC+5:30) day,
// not the UTC day. All boundaries below are the REAL UTC instants of IST
// midnights (IST midnight = 18:30 UTC the previous day). The backend rollup keys
// each day's marker (dayMs) by the same IST-midnight instant, and raw-doc filters
// (live counts, Reports) compare these against real `createdAt` timestamps — so
// everything agrees on the India day.
const IST = 5.5 * 60 * 60 * 1000;

/** Real UTC ms of the India (IST) midnight at or before `ms`. Exported so the
 *  rollup reader floors range starts to the same India-day boundary. */
export function startOfIstDay(ms: number): number {
  const s = new Date(ms + IST);
  return Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) - IST;
}

/** Start of the India month containing `ms` (offset 0 = this month, -1 = prev). */
function startOfIstMonth(ms: number, offset: number): number {
  const s = new Date(ms + IST);
  return Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + offset, 1) - IST;
}

export function resolveRange(preset: Preset, custom?: { start?: string; end?: string }): Range {
  const now = Date.now();
  const t0 = startOfIstDay(now);
  switch (preset) {
    case 'today':
      return { start: t0, end: t0 + DAY, label: 'Today' };
    case 'yesterday':
      return { start: t0 - DAY, end: t0, label: 'Yesterday' };
    case 'last7':
      return { start: t0 - 6 * DAY, end: t0 + DAY, label: 'Last 7 Days' };
    case 'last30':
      return { start: t0 - 29 * DAY, end: t0 + DAY, label: 'Last 30 Days' };
    case 'thisMonth':
      return { start: startOfIstMonth(now, 0), end: startOfIstMonth(now, 1), label: 'This Month' };
    case 'prevMonth':
      return { start: startOfIstMonth(now, -1), end: startOfIstMonth(now, 0), label: 'Previous Month' };
    case 'allTime':
      // everything from the epoch through the end of the current India day
      return { start: 0, end: t0 + DAY, label: 'All Time' };
    case 'custom': {
      // custom supports full date + time (datetime-local values, admin's local = IST).
      const s = custom?.start ? new Date(custom.start).getTime() : t0;
      const e = custom?.end ? new Date(custom.end).getTime() : t0 + DAY;
      return { start: s, end: e > s ? e : s + DAY, label: 'Custom' };
    }
  }
}
