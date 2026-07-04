// Admin role tiers and what each can see. Single source of truth for the
// sidebar and route guards. Kept in sync with the `adminRole` custom claim.

export type AdminRole = 'super' | 'ops' | 'astrology';

export const ROLE_LABEL: Record<string, string> = {
  super: 'Super Admin',
  ops: 'Chief Operations Admin',
  astrology: 'Chief Astrology Admin',
};

// Sidebar routes each role may open. 'super' sees everything ('*').
// - ops: everything except the admin-team page (top-line money is hidden
//        inside the Dashboard, not by removing whole sections).
// - astrology: only the astrologer world.
const ROLE_ROUTES: Record<AdminRole, string[] | '*'> = {
  super: '*',
  ops: ['/', '/astrologers', '/users', '/plans', '/banners', '/coupons', '/payouts', '/pricing', '/broadcast', '/reports', '/support', '/cms', '/audit'],
  astrology: ['/astrologers'],
};

const norm = (r: string | null | undefined): AdminRole =>
  r === 'super' || r === 'ops' || r === 'astrology' ? r : 'ops';

export function canSee(role: string | null | undefined, href: string): boolean {
  const routes = ROLE_ROUTES[norm(role)];
  return routes === '*' || routes.includes(href);
}

/** Like canSee but matches nested paths too (e.g. /users/abc under /users). */
export function canOpen(role: string | null | undefined, pathname: string): boolean {
  const routes = ROLE_ROUTES[norm(role)];
  if (routes === '*') return true;
  return routes.some((r) => (r === '/' ? pathname === '/' : pathname === r || pathname.startsWith(r + '/')));
}

/** Where to send an admin who lands on a route they can't see. */
export function landingFor(role: string | null | undefined): string {
  return canSee(role, '/') ? '/' : '/astrologers';
}
