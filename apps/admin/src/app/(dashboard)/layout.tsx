'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { canSee, canOpen, landingFor, ROLE_LABEL } from '@/lib/roles';

const I = (p: ReactNode) => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {p}
  </svg>
);

// Sidebar in the numbered order from the product spec. Items 1–12 first, then
// the operational areas (Payouts, Pricing, Support) and Admin Management.
const DASH_ICON = I(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>);
const STORE_ICON = I(<><path d="M3 9l1-5h16l1 5" /><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><path d="M9 22V12h6v10" /></>);

// The Asktro Mall section has its OWN sidebar menu — a portal-inside-the-portal.
const MALL_NAV = [
  { href: '/mall', label: 'Dashboard', icon: DASH_ICON },
  { href: '/store', label: 'Catalog', icon: STORE_ICON },
  { href: '/store-inventory', label: 'Inventory', icon: I(<><path d="M20 7l-8-4-8 4v10l8 4 8-4z" /><path d="M4 7l8 4 8-4" /><path d="M12 21V11" /></>) },
  { href: '/store-orders', label: 'Orders', icon: I(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="M8 14h5" /></>) },
  { href: '/store-discounts', label: 'Discounts', icon: I(<><path d="M9 9h.01M15 15h.01M16 8l-8 8" /><path d="M20 12a2 2 0 0 1 2-2V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v3a2 2 0 0 1 0 4v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a2 2 0 0 1-2-2z" /></>) },
  { href: '/store-shipping', label: 'Shipping', icon: I(<><rect x="1" y="3" width="15" height="13" /><path d="M16 8h4l3 3v5h-7z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></>) },
  { href: '/store-content', label: 'Content', icon: I(<><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>) },
  { href: '/store-front', label: 'Storefront', icon: I(<><rect x="3" y="4" width="18" height="14" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>) },
  { href: '/home-content', label: 'Home Screen', icon: I(<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></>) },
  { href: '/', label: '‹ Back to App Console', icon: I(<><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>) },
];

const NAV = [
  { href: '/mall', label: 'Asktro Mall Dashboard', icon: STORE_ICON },
  { href: '/', label: 'App Dashboard', icon: DASH_ICON },
  { href: '/users', label: 'Customer Management', icon: I(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>) },
  { href: '/astrologers', label: 'Astrologer Management', icon: I(<path d="M12 2.5l2.2 6.4 6.8.3-5.3 4.2 1.8 6.6L12 16.9 6.5 20l1.8-6.6L3 9.2l6.8-.3z" />) },
  { href: '/phone-sessions', label: 'Phone Sessions', icon: I(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />) },
  { href: '/video-sessions', label: 'Video Sessions', icon: I(<><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></>) },
  { href: '/plans', label: 'Recharge Plans', icon: I(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>) },
  { href: '/recharges', label: 'Recharges', icon: I(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><circle cx="8" cy="15" r="1.4" /></>) },
  { href: '/banners', label: 'Banners Management', icon: I(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>) },
  { href: '/blogs', label: 'Blogs', icon: I(<><path d="M4 4h11a2 2 0 0 1 2 2v14l-4-2-4 2V6a2 2 0 0 0-2-2H4z" /><path d="M8 8h5M8 12h5" /></>) },
  { href: '/coupons', label: 'Coupons Management', icon: I(<path d="M20 12a2 2 0 0 1 2-2V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v3a2 2 0 0 1 0 4v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a2 2 0 0 1-2-2z" />) },
  { href: '/broadcast', label: 'Push Notifications', icon: I(<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>) },
  { href: '/reports', label: 'Reports', icon: I(<><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>) },
  { href: '/kundali-downloads', label: 'Kundali Downloads', icon: I(<><path d="M12 2.5l2.2 6.4 6.8.3-5.3 4.2 1.8 6.6L12 16.9 6.5 20l1.8-6.6L3 9.2l6.8-.3z" /><path d="M12 12v6M9.5 15.5L12 18l2.5-2.5" /></>) },
  { href: '/cms', label: 'CMS', icon: I(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>) },
  { href: '/audit', label: 'Audit Log', icon: I(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />) },
  { href: '/payouts', label: 'Payouts', icon: I(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="16" cy="12" r="1.7" /></>) },
  { href: '/pricing', label: 'Pricing & Settings', icon: I(<><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></>) },
  { href: '/moderation', label: 'Trust & Safety', icon: I(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></>) },
  { href: '/support', label: 'Support', icon: I(<><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></>) },
  { href: '/admins', label: 'Admin Management', icon: I(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>) },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading, adminRole, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // Off-canvas drawer state for phones/tablets: the sidebar is hidden so
  // content gets the full width, and slides in over a backdrop when opened.
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) { router.replace('/login'); return; }
    // Keep an admin out of sections their role can't open.
    if (!loading && user && isAdmin && !canOpen(adminRole, pathname)) {
      router.replace(landingFor(adminRole));
    }
  }, [loading, user, isAdmin, adminRole, pathname, router]);

  // Any navigation closes the drawer.
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  if (loading || !user || !isAdmin) {
    return <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>Loading…</div>;
  }

  // The Mall is a portal-inside-the-portal: on any store route the whole left
  // menu swaps to the Mall's own nav (and the section takes the ghee-gold look).
  const mallPaths = ['/mall', '/store', '/store-inventory', '/store-orders', '/store-discounts', '/store-shipping', '/store-content', '/store-front', '/home-content'];
  const isMall = mallPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const nav = (isMall ? MALL_NAV : NAV).filter((n) => canSee(adminRole, n.href));

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div className="celestial-bg" aria-hidden />
      {/* Mobile-only top bar (light, to match the content area). */}
      <header className="topbar">
        <button className="topbar__burger" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="topbar__emblem" src="/brand/emblem.png" alt="Asktro" />
        <span className="topbar__word">Asktro<span className="brand-tld">.in</span></span>
      </header>
      {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-hidden />}
      <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}${mobileOpen ? ' sidebar--open' : ''}${isMall ? ' sidebar--mall' : ''}`}>
        <button className="sidebar__close" onClick={() => setMobileOpen(false)} aria-label="Close menu">×</button>
        <div className="sidebar__brand">
          <div className="brand-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-emblem" src="/brand/emblem.png" alt="Asktro" />
            <span className="brand-word">Asktro<span className="brand-tld">.in</span></span>
          </div>
          <span className="brand-tag">Guidance written in the stars</span>
        </div>
        <p className="sidebar__eyebrow">{isMall ? 'Asktro Mall' : 'Operations Console'}</p>
        <button
          className="sidebar__toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Open menu' : 'Close menu'}
        >
          {collapsed ? '›' : '‹'}
        </button>
        <button
          className="sidebar__toggle sidebar__toggle--bottom"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Open menu' : 'Close menu'}
        >
          {collapsed ? '›' : '‹'}
        </button>
        <nav className="sidebar__nav">
          {nav.map((n) => {
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
          <span className="badge">{ROLE_LABEL[adminRole ?? ''] ?? 'Admin'}</span>
          <button className="sidebar__logout" onClick={() => logout()}>
            Log out
          </button>
        </div>
      </aside>
      <main className={`main${isMall ? ' mall-theme' : ''}`}>{children}</main>
    </div>
  );
}
