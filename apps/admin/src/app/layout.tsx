import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import ClickSound from '@/components/ClickSound';

export const metadata: Metadata = {
  title: 'ASKTRO Admin',
  description: 'ASKTRO operations console',
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
