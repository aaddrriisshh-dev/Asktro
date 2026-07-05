'use client';

import { useState } from 'react';

/** Known in-app destinations (must match the app's go_router routes). Adding a
 *  new route to the app? Add it here too. `astro` and `custom` are special. */
const DESTS = [
  { key: '', label: 'No deep link (do nothing on tap)' },
  { key: '/recharge', label: 'Recharge / Wallet' },
  { key: '/home', label: 'Home' },
  { key: 'astro', label: 'A specific astrologer…' },
  { key: 'custom', label: 'Custom route (advanced)' },
] as const;

function selectionFor(value: string): string {
  if (value === '') return '';
  if (value === '/recharge' || value === '/home') return value;
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
    if (k === '/recharge' || k === '/home') onChange(k);
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
