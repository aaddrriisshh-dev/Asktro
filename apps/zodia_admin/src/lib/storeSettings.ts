'use client';

import { useCollection } from './hooks';

/** Default low-stock alert level, used until an admin sets one in the portal. */
export const DEFAULT_LOW_STOCK = 5;

/** Portal-managed store settings live in homeSections/storeSettings (signed-in
 *  read, admin write — no separate rules needed). Only specific home docs are
 *  read by the app, so a settings doc here never renders on the storefront. */
export function useLowStockThreshold(): number {
  const { rows } = useCollection('homeSections');
  const cfg = rows.find((r) => r.id === 'storeSettings');
  const v = cfg?.lowStockThreshold;
  return typeof v === 'number' && v > 0 ? v : DEFAULT_LOW_STOCK;
}
