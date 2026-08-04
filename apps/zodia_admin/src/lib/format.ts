/** Money/format helpers mirroring the backend (integer paise). */
export function formatPaise(paise: number | undefined | null): string {
  const p = paise ?? 0;
  return `₹${(p / 100).toLocaleString('en-IN')}`;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function formatDate(ms?: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 'YYYY-MM-DD' → '7 Jun' — an unambiguous chart-axis day label. */
export function shortDay(iso: string): string {
  const parts = iso.split('-');
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  return `${d} ${MONTHS[m - 1] ?? ''}`.trim();
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}
