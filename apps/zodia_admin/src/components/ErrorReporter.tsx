'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/reportError';

/**
 * Catches errors that React error boundaries miss — uncaught exceptions and
 * unhandled promise rejections anywhere in the portal — and forwards them to
 * the backend (→ Slack). Renders nothing; mounted once in the root layout.
 */
export default function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      reportClientError({
        message: e.message || 'Uncaught error',
        stack: e.error?.stack,
        url: window.location.href,
        kind: 'window.onerror',
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      reportClientError({
        message: (r && r.message) || String(r),
        stack: r?.stack,
        url: window.location.href,
        kind: 'unhandledrejection',
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
