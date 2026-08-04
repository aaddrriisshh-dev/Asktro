'use client';

import { httpsCallable } from 'firebase/functions';
import { functions, auth } from './firebase';

/**
 * Send an uncaught portal error to the backend, which records it and forwards
 * it to Slack. Reporting must never itself throw or loop, so every failure is
 * swallowed and reports are throttled client-side. Skipped when signed out
 * (the callable requires an admin, and logged-out login-page glitches aren't
 * worth paging on).
 */
let lastReportAt = 0;

export async function reportClientError(info: {
  message: string; stack?: string; url?: string; kind?: string;
}): Promise<void> {
  try {
    if (!auth.currentUser) return;
    const now = Date.now();
    if (now - lastReportAt < 5000) return; // at most one report / 5s
    lastReportAt = now;
    await httpsCallable(functions, 'reportClientError')({
      message: info.message,
      stack: info.stack,
      url: info.url,
      kind: info.kind,
    });
  } catch {
    // Reporting is best-effort — never surface or rethrow.
  }
}
