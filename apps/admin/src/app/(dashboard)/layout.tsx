'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

const I = (p: ReactNode) => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {p}
  </svg>
);

const NAV = [
  { href: '/', label: 'Dashboard', icon: I(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>) },
  { href: '/astrologers', label: 'Astrologers', icon: I(<path d="M12 2.5l2.2 6.4 6.8.3-5.3 4.2 1.8 6.6L12 16.9 6.5 20l1.8-6.6L3 9.2l6.8-.3z" />) },
  { href: '/users', label: 'Users', icon: I(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>) },
  { href: '/plans', label: 'Recharge Plans', icon: I(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>) },
  { href: '/banners', label: 'Banners', icon: I(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>) },
  { href: '/coupons', label: 'Coupons', icon: I(<path d="M20 12a2 2 0 0 1 2-2V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v3a2 2 0 0 1 0 4v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a2 2 0 0 1-2-2z" />) },
  { href: '/payouts', label: 'Payouts', icon: I(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="16" cy="12" r="1.7" /></>) },
  { href: '/pricing', label: 'Pricing & Settings', icon: I(<><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></>) },
  { href: '/broadcast', label: 'Notifications', icon: I(<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>) },
  { href: '/reports', label: 'Reports', icon: I(<><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>) },
  { href: '/support', label: 'Support', icon: I(<><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></>) },
  { href: '/cms', label: 'CMS', icon: I(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>) },
  { href: '/audit', label: 'Audit Log', icon: I(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />) },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading, adminRole, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.replace('/login');
  }, [loading, user, isAdmin, router]);

  if (loading || !user || !isAdmin) {
    return <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>Loading…</div>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div className="celestial-bg" aria-hidden />
      <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
        <div className="sidebar__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-emblem" src="/brand/emblem.png" alt="Asktro" />
          <div className="brand-text">
            <span className="brand-word">Asktro<span className="brand-tld">.in</span></span>
            <span className="brand-tag">Guidance written in the stars</span>
          </div>
        </div>
        <p className="sidebar__eyebrow">Operations Console</p>
        <button
          className="sidebar__toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Open menu' : 'Close menu'}
        >
          {collapsed ? 'Open ›' : '‹ Close'}
        </button>
        <nav className="sidebar__nav">
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link key={n.href} href={n.href} className={`sidebar__link${active ? ' active' : ''}`} title={n.label}>
                <span className="sidebar__ico">{n.icon}</span>
                <span className="sidebar__label">{n.label}</span>
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
