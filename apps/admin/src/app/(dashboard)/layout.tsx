'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/astrologers', label: 'Astrologers' },
  { href: '/users', label: 'Users' },
  { href: '/plans', label: 'Recharge Plans' },
  { href: '/banners', label: 'Banners' },
  { href: '/coupons', label: 'Coupons' },
  { href: '/payouts', label: 'Payouts' },
  { href: '/pricing', label: 'Pricing & Settings' },
  { href: '/broadcast', label: 'Notifications' },
  { href: '/support', label: 'Support' },
  { href: '/cms', label: 'CMS' },
  { href: '/audit', label: 'Audit Log' },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading, adminRole, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.replace('/login');
  }, [loading, user, isAdmin, router]);

  if (loading || !user || !isAdmin) {
    return <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>Loading…</div>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: 240,
          background: 'var(--card)',
          borderRight: '1px solid var(--border)',
          padding: 20,
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        <h2 style={{ color: 'var(--primary)', marginTop: 0 }}>ASKTRO</h2>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'var(--primary)' : 'var(--text)',
                  fontWeight: active ? 600 : 400,
                }}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div style={{ position: 'absolute', bottom: 20, left: 20, right: 20 }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
            {user.email}
            <br />
            <span className="badge">{adminRole ?? 'admin'}</span>
          </div>
          <button className="btn secondary sm" style={{ width: '100%' }} onClick={() => logout()}>
            Log out
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: 28, maxWidth: 1200 }}>{children}</main>
    </div>
  );
}
