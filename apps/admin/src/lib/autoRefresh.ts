'use client';

import { useEffect, useState } from 'react';

/**
 * Shared auto-refresh clock for the dashboard's snapshot-read cards (the ones
 * that fetch once on open, unlike the live Firestore listeners). A single
 * module-level timer ticks every REFRESH_MS and on tab focus / regained
 * visibility; every subscribed card re-runs its fetch, and a visible badge shows
 * how long ago the last refresh happened.
 *
 *   const tick = useAutoRefresh();   // include `tick` in your fetch effect deps
 *   const { lastMs, refreshNow } = useRefreshMeta();  // for the badge
 */
const REFRESH_MS = 60_000;

let counter = 0;
let lastMs = Date.now();
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function bump() {
  counter += 1;
  lastMs = Date.now();
  subs.forEach((f) => f());
}

function ensureTimer() {
  if (timer || typeof window === 'undefined') return;
  timer = setInterval(bump, REFRESH_MS);
  window.addEventListener('focus', bump);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) bump(); });
}

/** Returns a counter that changes on every refresh — put it in fetch deps. */
export function useAutoRefresh(): number {
  const [, force] = useState(0);
  useEffect(() => {
    ensureTimer();
    const s = () => force((x) => x + 1);
    subs.add(s);
    return () => { subs.delete(s); };
  }, []);
  return counter;
}

/** Force an immediate refresh of every subscribed card. */
export function refreshNow() { bump(); }

/** For the badge: the last-refresh time + a manual trigger; re-renders as time passes. */
export function useRefreshMeta(): { lastMs: number; refreshNow: () => void } {
  const [, force] = useState(0);
  useEffect(() => {
    ensureTimer();
    const s = () => force((x) => x + 1);
    subs.add(s);
    const t = setInterval(() => force((x) => x + 1), 15_000); // keep "X ago" fresh
    return () => { subs.delete(s); clearInterval(t); };
  }, []);
  return { lastMs, refreshNow };
}
