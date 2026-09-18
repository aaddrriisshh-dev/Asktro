/**
 * The single source of truth for "is this a real customer?" — used by EVERY
 * customer count across the portal (dashboard cards + Customer Management) so the
 * numbers are consistent and reflect real people only.
 *
 * A real customer is a user account that is NOT deleted and NOT a tagged test
 * account (the founder's own / teammate test logins we cleaned up). Incomplete
 * (abandoned-setup) accounts ARE real people who signed up, so they stay counted
 * — they're surfaced as their own "Incomplete signups" subset, not removed.
 */
export function isRealCustomer(u: Record<string, unknown>): boolean {
  return u.accountStatus !== 'deleted' && u.isTestAccount !== true;
}
