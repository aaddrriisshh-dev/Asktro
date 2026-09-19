'use client';

import { useState } from 'react';
import { useCollection, Row } from '@/lib/hooks';
import { formatPaise } from '@/lib/format';

/** Known in-app destinations (must match the app's go_router routes). Adding a
 *  new route to the app? Add it here too. `plan`, `coupon`, `astro` and `custom`
 *  are special: they reveal a sub-picker below and build the final route string. */
const DESTS = [
  { key: '', label: 'No deep link (do nothing on tap)' },
  { key: '/recharge', label: 'Recharge / Wallet' },
  { key: 'plan', label: 'A specific offer / recharge plan…' },
  { key: 'coupon', label: 'A specific coupon…' },
  { key: '/offers', label: 'Offers & Coupons (show all)' },
  { key: '/store', label: 'Asktro Mall' },
  { key: '/home', label: 'Home' },
  { key: '/astrologers/verified', label: 'Verified Astrologers (real)' },
  { key: '/astrologers/new', label: 'New Astrologers (AI)' },
  { key: 'astro', label: 'A specific astrologer…' },
  { key: 'custom', label: 'Custom route (advanced)' },
] as const;

const DIRECT = ['/recharge', '/store', '/offers', '/home', '/astrologers/verified', '/astrologers/new'];

function selectionFor(value: string): string {
  if (value === '') return '';
  if (value.startsWith('/recharge?plan=')) return 'plan';
  if (value.startsWith('/recharge?coupon=')) return 'coupon';
  if (DIRECT.includes(value)) return value;
  if (value.startsWith('/astrologer/')) return 'astro';
  return 'custom';
}

/** Dropdown of valid app destinations, stored as the route string the app
 *  navigates to (e.g. '/recharge?plan=<id>'). Shared by the Banner & Push
 *  composers. Picking "a specific offer / plan" or "a specific coupon" pulls the
 *  REAL, live plans/coupons from Firestore so the admin selects an actual offer
 *  instead of hand-typing an id, and it builds the deep link the app already
 *  understands (/recharge?plan=<id> pre-selects that plan; ?coupon=<CODE>
 *  auto-applies that coupon). */
export function DeepLinkSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [sel, setSel] = useState<string>(selectionFor(value));
  const { rows: plans } = useCollection('rechargePlans');
  const { rows: coupons } = useCollection('coupons');

  const activePlans = plans.filter((p) => p.active !== false);
  const activeCoupons = coupons.filter((c) => c.active !== false);
  const planLabel = (p: Row) => {
    const bonus = (p.bonus as number) ?? 0;
    return `${formatPaise(p.amount as number)}${bonus > 0 ? ` → +${formatPaise(bonus)} bonus` : ''}`;
  };

  const astroId = sel === 'astro' ? value.replace('/astrologer/', '') : '';
  const custom = sel === 'custom' ? value : '';
  const planId = sel === 'plan' ? value.replace('/recharge?plan=', '') : '';
  const couponCode = sel === 'coupon' ? value.replace('/recharge?coupon=', '') : '';

  function pick(k: string) {
    setSel(k);
    if (DIRECT.includes(k)) onChange(k);
    else if (k === 'astro') onChange('/astrologer/');
    else onChange(''); // plan / coupon / custom / '' — start empty, fill via the sub-picker
  }

  return (
    <div>
      <select className="input" value={sel} onChange={(e) => pick(e.target.value)}>
        {DESTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
      </select>

      {sel === 'plan' && (
        <select className="input" style={{ marginTop: 8 }} value={planId}
          onChange={(e) => onChange(e.target.value ? `/recharge?plan=${e.target.value}` : '')}>
          <option value="">
            {activePlans.length === 0 ? 'No active plans — create one in Recharge Plans first' : 'Pick a plan / offer…'}
          </option>
          {activePlans.map((p) => <option key={p.id} value={p.id}>{planLabel(p)}</option>)}
        </select>
      )}

      {sel === 'coupon' && (
        <select className="input" style={{ marginTop: 8 }} value={couponCode}
          onChange={(e) => onChange(e.target.value ? `/recharge?coupon=${e.target.value}` : '')}>
          <option value="">
            {activeCoupons.length === 0 ? 'No active coupons — create one in Coupons Management' : 'Pick a coupon…'}
          </option>
          {activeCoupons.map((c) => (
            <option key={c.id} value={c.code as string}>
              {`${c.code as string}${c.title ? ` — ${c.title as string}` : ''}`}
            </option>
          ))}
        </select>
      )}

      {sel === 'astro' && (
        <input className="input" style={{ marginTop: 8 }} placeholder="Astrologer ID (copy from Astrologer Management)"
          value={astroId} onChange={(e) => onChange('/astrologer/' + e.target.value.trim())} />
      )}
      {sel === 'custom' && (
        <input className="input" style={{ marginTop: 8 }} placeholder="/your-route"
          value={custom} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
