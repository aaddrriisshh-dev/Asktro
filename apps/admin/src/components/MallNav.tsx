'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** The Asktro Mall section's own menu. Rendered at the top of every store page
 *  so the whole e-commerce back-office feels like one contained world, separate
 *  from the main operations sidebar. Add new store sections here as they ship. */
const TABS = [
  { href: '/mall', label: 'Dashboard' },
  { href: '/store', label: 'Catalog' },
  { href: '/store-orders', label: 'Orders' },
  { href: '/store-content', label: 'Content' },
  { href: '/home-content', label: 'Home Screen' },
];

export function MallNav() {
  const pathname = usePathname();
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        paddingBottom: 14, marginBottom: 18, borderBottom: '1px solid var(--border, #eaddbf)',
      }}
    >
      <Link href="/mall" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
        <span style={{ fontSize: 20 }}>🛍️</span>
        <strong style={{ fontSize: 16, color: 'var(--fg, #3a2e17)' }}>Asktro Mall</strong>
      </Link>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const active = pathname === t.href || (t.href !== '/mall' && pathname.startsWith(t.href));
          return (
            <Link key={t.href} href={t.href} className={`btn sm ${active ? '' : 'secondary'}`}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
