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
  { href: '/reports', label: 'Reports' },
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
      <aside className="sidebar">
        <div className="sidebar__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/emblem.png" alt="" />
          <span className="sidebar__brand-name">ASKTRO</span>
        </div>
        <p className="sidebar__eyebrow">Operations Console</p>
        <nav className="sidebar__nav">
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link key={n.href} href={n.href} className={`sidebar__link${active ? ' active' : ''}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar__foot">
          <div className="sidebar__email">{user.email}</div>
          <span className="badge">{adminRole ?? 'admin'}</span>
          <button className="sidebar__logout" onClick={() => logout()}>
            Log out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
