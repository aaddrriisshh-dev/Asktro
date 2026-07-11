import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import ClickSound from '@/components/ClickSound';
import ErrorReporter from '@/components/ErrorReporter';

export const metadata: Metadata = {
  title: 'ASKTRO Admin',
  description: 'ASKTRO operations console',
};

// Explicit so the mobile-responsive layout scales to the device width instead
// of rendering as a zoomed-out desktop page.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// The console is entirely auth-gated and Firebase-driven at runtime — there is
// nothing to statically prerender, so render dynamically and skip build-time
// prerendering (which would otherwise boot Firebase with placeholder keys).
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClickSound />
        <ErrorReporter />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
