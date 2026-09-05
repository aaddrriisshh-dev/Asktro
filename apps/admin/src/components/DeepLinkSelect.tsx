'use client';

import { useState } from 'react';

/** Known in-app destinations (must match the app's go_router routes). Adding a
 *  new route to the app? Add it here too. `astro` and `custom` are special. */
const DESTS = [
  { key: '', label: 'No deep link (do nothing on tap)' },
  { key: '/recharge', label: 'Recharge / Wallet' },
  { key: '/store', label: 'Asktro Mall' },
  { key: '/offers', label: 'Offers & Coupons' },
  { key: '/home', label: 'Home' },
  { key: 'astro', label: 'A specific astrologer…' },
  { key: 'custom', label: 'Custom route (advanced)' },
] as const;

const DIRECT = ['/recharge', '/store', '/offers', '/home'];

function selectionFor(value: string): string {
  if (value === '') return '';
  if (DIRECT.includes(value)) return value;
  if (value.startsWith('/astrologer/')) return 'astro';
  return 'custom';
}

/** Dropdown of valid app destinations, stored as the route string the app
 *  navigates to (e.g. '/recharge'). Shared by the Banner & Push composers. */
export function DeepLinkSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [sel, setSel] = useState<string>(selectionFor(value));
  const astroId = sel === 'astro' ? value.replace('/astrologer/', '') : '';
  const custom = sel === 'custom' ? value : '';

  function pick(k: string) {
    setSel(k);
    if (DIRECT.includes(k)) onChange(k);
    else if (k === 'astro') onChange('/astrologer/');
    else onChange(''); // '' or 'custom' — start empty, fill via the input
  }

  return (
    <div>
      <select className="input" value={sel} onChange={(e) => pick(e.target.value)}>
        {DESTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
      </select>
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
