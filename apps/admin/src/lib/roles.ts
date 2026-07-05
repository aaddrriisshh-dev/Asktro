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
// - astrology (Neeraj): the astrologer world in full (onboarding, management,
//        auditing session transcripts) + Payouts as view-only.
const ROLE_ROUTES: Record<AdminRole, string[] | '*'> = {
  super: '*',
  ops: ['/', '/users', '/astrologers', '/phone-sessions', '/video-sessions', '/plans', '/banners', '/coupons', '/broadcast', '/reports', '/cms', '/audit', '/payouts', '/pricing', '/support'],
  astrology: ['/astrologers', '/phone-sessions', '/video-sessions', '/payouts', '/audit'],
};

// Routes a role may OPEN but not change (view-only). Enforced in the UI and,
// for money, in Firestore rules / callables too.
const ROLE_READONLY: Record<AdminRole, string[]> = {
  super: [],
  ops: ['/pricing', '/payouts'], // Ops sees pricing & payouts but can't change/process them
  astrology: ['/payouts'],       // Neeraj sees payouts but can't process them
};

const norm = (r: string | null | undefined): AdminRole =>
  r === 'super' || r === 'ops' || r === 'astrology' ? r : 'ops';

export function canSee(role: string | null | undefined, href: string): boolean {
  const routes = ROLE_ROUTES[norm(role)];
  return routes === '*' || routes.includes(href);
}

/** Whether a role may make changes on a route it can see (false = view-only). */
export function canEdit(role: string | null | undefined, href: string): boolean {
  const r = norm(role);
  if (r === 'super') return true;
  return !ROLE_READONLY[r].includes(href);
}

/** Whether a role may see company-level money (Total Revenue, Net Profit,
 *  Money held & owed on the Dashboard). Super only. */
export function canSeeMoney(role: string | null | undefined): boolean {
  return norm(role) === 'super';
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
