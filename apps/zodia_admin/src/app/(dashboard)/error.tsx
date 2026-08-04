'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/reportError';

/**
 * Dashboard error boundary: catches render/runtime errors in any dashboard
 * page, reports them (→ Slack), and shows a recoverable fallback instead of a
 * blank white screen.
 */
export default function DashboardError({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError({
      message: error.message || 'Render error',
      stack: error.stack,
      url: typeof window !== 'undefined' ? window.location.href : '',
      kind: 'react-error-boundary',
    });
  }, [error]);

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', textAlign: 'center', padding: 24 }}>
      <div>
        <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
        <p className="muted" style={{ marginBottom: 18 }}>
          This page hit an error. It’s been reported automatically — you can try again.
        </p>
        <button className="btn" onClick={() => reset()}>Try again</button>
      </div>
    </div>
  );
}
