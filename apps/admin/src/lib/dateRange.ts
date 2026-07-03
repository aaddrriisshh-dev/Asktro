/** Shared date-range presets for dashboard cards. All ranges are [start, end). */
export type Preset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'prevMonth'
  | 'custom';

export const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 Days' },
  { key: 'last30', label: 'Last 30 Days' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'prevMonth', label: 'Previous Month' },
  { key: 'custom', label: 'Custom Range' },
];

export interface Range {
  start: number; // ms inclusive
  end: number; // ms exclusive
  label: string;
}

const DAY = 86_400_000;
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function resolveRange(preset: Preset, custom?: { start?: string; end?: string }): Range {
  const now = new Date();
  const t0 = startOfDay(now).getTime();
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
      const s = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
      return { start: s, end: e, label: 'This Month' };
    }
    case 'prevMonth': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      const e = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return { start: s, end: e, label: 'Previous Month' };
    }
    case 'custom': {
      const s = custom?.start ? startOfDay(new Date(custom.start)).getTime() : t0;
      const e = custom?.end ? startOfDay(new Date(custom.end)).getTime() + DAY : t0 + DAY;
      return { start: s, end: e, label: 'Custom' };
    }
  }
}
