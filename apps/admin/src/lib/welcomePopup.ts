// Shared model + helpers for the welcome_reward "Home Pop-up Studio".
//
// These keys MUST match the Firestore field contract that the Flutter app's
// home_popup_config.dart (HomePopup.fromMap) reads:
//   gstRatePct, showBreakup, totalOverridePaise,
//   breakupRows[{ label, amountPaise }], bgTheme, particleStyle,
//   titleWord1, titleWord2, character
// All are optional; the defaults below reproduce the current live look.

export type ParticleStyle = 'mixed' | 'stars' | 'coins' | 'none';

/** '' is treated exactly like 'lavender' (the current default gradient). */
export type BgThemeId = '' | 'lavender' | 'aurora' | 'midnight' | 'nebula' | 'emerald';

export interface BreakupRow {
  label: string;
  amountPaise: number;
}

export interface BgTheme {
  id: Exclude<BgThemeId, ''>;
  name: string;
  /** top → bottom gradient stops. Must match the app + the field contract. */
  stops: [string, string, string, string];
  /** a small swatch gradient for the chip dot. */
  dot: string;
  /** dark-top themes render the headline / subtitle / offer text near-white. */
  dark: boolean;
}

// Gradient stops copied verbatim from POPUP_FIELD_CONTRACT.md.
export const BG_THEMES: BgTheme[] = [
  { id: 'lavender', name: 'Lavender Dawn', stops: ['#ECE1FB', '#F3ECFF', '#FBF9FF', '#FFFFFF'], dot: 'linear-gradient(135deg,#ECE1FB,#FBF9FF)', dark: false },
  { id: 'aurora', name: 'Golden Aurora', stops: ['#FBE5B8', '#F7EEDA', '#FBF7EF', '#FFFFFF'], dot: 'linear-gradient(135deg,#FBE7BE,#F6D98E)', dark: false },
  { id: 'nebula', name: 'Rose Nebula', stops: ['#F0D5EC', '#EED8F6', '#F8EFFB', '#FFFFFF'], dot: 'linear-gradient(135deg,#F3D7E9,#E7C4F0)', dark: false },
  { id: 'midnight', name: 'Midnight Sky', stops: ['#2A2060', '#3A2F7A', '#EDE7FB', '#FFFFFF'], dot: 'linear-gradient(135deg,#241a55,#0f0b26)', dark: true },
  { id: 'emerald', name: 'Emerald Night', stops: ['#13463A', '#1E5E4B', '#E4F3EC', '#FFFFFF'], dot: 'linear-gradient(135deg,#123a2f,#0e2a37)', dark: true },
];

export function bgTheme(id: BgThemeId | undefined | null): BgTheme {
  const found = id ? BG_THEMES.find((t) => t.id === id) : undefined;
  return found ?? BG_THEMES[0]; // '' / unknown → lavender
}

/** Wallet credit each built-in plan grants on the server (display only — the
 *  server is the source of truth). custom / unknown → null ("set by the plan"). */
export const PLAN_CREDIT: Record<string, number | null> = {
  promo_welcome: 5000,
  promo_double: 10000,
  plan_99: 9900,
  custom: null,
};

export const PLAN_OPTIONS: { id: string; label: string }[] = [
  { id: 'promo_welcome', label: 'promo_welcome — ₹25 pay → ₹50 credited (first recharge)' },
  { id: 'promo_double', label: 'promo_double — ₹50 pay → ₹100 credited' },
  { id: 'plan_99', label: 'plan_99 — ₹99 pay → ₹99 credited' },
  { id: 'custom', label: 'custom plan ID…' },
];

export const PARTICLE_OPTIONS: { id: ParticleStyle; label: string }[] = [
  { id: 'mixed', label: '✦ Stars + coins' },
  { id: 'stars', label: '✧ Stars only' },
  { id: 'coins', label: '🪙 Coins only' },
  { id: 'none', label: 'None' },
];

export interface WelcomeTotals {
  gstPaise: number;
  extrasPaise: number;
  autoPaise: number;
  /** the effective grand total (override when set, else auto). */
  totalPaise: number;
}

/** Grand total in paise. auto = base + GST(base) + extra lines; an explicit
 *  override wins. This is DISPLAY only — the real charge is the plan's amount. */
export function computeWelcomeTotals(opts: {
  rechargeBasePaise: number;
  gstRatePct: number;
  breakupRows: BreakupRow[];
  totalOverridePaise: number | null;
}): WelcomeTotals {
  const base = Math.max(0, opts.rechargeBasePaise || 0);
  const gstPaise = Math.round(base * ((opts.gstRatePct || 0) / 100));
  const extrasPaise = (opts.breakupRows || []).reduce((s, r) => s + (r.amountPaise || 0), 0);
  const autoPaise = base + gstPaise + extrasPaise;
  const totalPaise = opts.totalOverridePaise != null ? opts.totalOverridePaise : autoPaise;
  return { gstPaise, extrasPaise, autoPaise, totalPaise };
}

/** paise → "₹29.50" (2dp) or "₹50" (whole). */
export function rupees(paise: number): string {
  const r = (paise || 0) / 100;
  return '₹' + (Number.isInteger(r) ? String(r) : r.toFixed(2));
}

/** paise → plain rupee number for an <input type="number"> (no ₹, trims .00). */
export function paiseToInput(paise: number): number {
  return Math.round((paise || 0)) / 100;
}

/** rupee string from an input → paise. */
export function inputToPaise(v: string): number {
  return Math.round((parseFloat(v) || 0) * 100);
}
