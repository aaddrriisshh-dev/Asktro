'use client';

import { useRefreshMeta } from '@/lib/autoRefresh';

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  return `${h} hr${h === 1 ? '' : 's'} ago`;
}

/** Live "Refreshed X ago" pill with a manual refresh button — shows the
 *  dashboard is auto-updating without a page reload. */
export function RefreshBadge() {
  const { lastMs, refreshNow } = useRefreshMeta();
  return (
    <button type="button" className="refresh-badge" onClick={refreshNow} title="Refresh now">
      <span className="refresh-dot" aria-hidden />
      <span className="refresh-text">Refreshed {ago(lastMs)}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    </button>
  );
}
