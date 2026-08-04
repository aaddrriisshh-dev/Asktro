// Shared celestial theme catalog for promos (coupons, banners, push).
// Selecting a theme in a composer stores its `id` on the doc; the customer app
// has a matching catalog (packages/shared_flutter …/promo_theme.dart) keyed by
// the SAME ids, so the app renders the identical look. bgColor/textColor are
// still stored as solid fallbacks for older app builds.

export type ThemeLayout = 'split' | 'wm' | 'photo';
export type ThemeArt = 'gift' | 'mandala' | 'scenery' | 'zwhite' | 'zgold' | 'zviolet';

export interface PromoTheme {
  id: string;
  name: string;
  bg: string;        // CSS background (gradient / color / photo layer)
  tx: string;        // text colour
  edge: string;      // golden/outline colour
  base: string;      // representative SOLID colour, stored as bgColor fallback
  accent?: string;   // reward/CTA chip background
  accentTx?: string;
  layout: ThemeLayout;
  art?: ThemeArt;
  op?: number;       // watermark opacity
  medal: string;     // emoji in the medallion
}

export const ART_SRC: Record<ThemeArt, string> = {
  gift: '/promo-art/gift.webp',
  mandala: '/promo-art/mandala.webp',
  scenery: '/promo-art/scenery.webp',
  zwhite: '/promo-art/zwhite.webp',
  zgold: '/promo-art/zgold.webp',
  zviolet: '/promo-art/zviolet.webp',
};

export const PROMO_THEMES: PromoTheme[] = [
  { id: 'white', name: 'Clean White', bg: '#FFFFFF', tx: '#2A2350', edge: 'rgba(231,184,75,.9)', base: '#FFFFFF', layout: 'split', art: 'gift', medal: '🎁' },
  { id: 'ivory', name: 'Ivory Gold', bg: 'linear-gradient(135deg,#FFF8E9,#F3E4C2)', tx: '#4A3A12', edge: 'rgba(200,140,40,.75)', base: '#F6EACB', layout: 'split', art: 'mandala', medal: '🪔' },
  { id: 'blush', name: 'Blush Petal', bg: 'linear-gradient(135deg,#FDEEF4,#F6D6E4)', tx: '#5A2A46', edge: 'rgba(210,120,160,.8)', base: '#F6DCE7', layout: 'split', art: 'gift', medal: '🎁' },
  { id: 'lunar', name: 'Lunar Silver', bg: 'linear-gradient(150deg,#F5F0FD,#DBD0F2)', tx: '#2B2450', edge: 'rgba(126,87,194,.5)', base: '#E4DAF5', layout: 'wm', art: 'zviolet', op: 0.30, medal: '🌙' },
  { id: 'amethyst', name: 'Amethyst', bg: 'linear-gradient(140deg,#9576E8,#20190F)', tx: '#FFFFFF', edge: 'rgba(255,255,255,.6)', base: '#6E4FD0', layout: 'wm', art: 'zwhite', op: 0.34, medal: '🎁' },
  { id: 'midnight', name: 'Midnight Sky', bg: 'linear-gradient(160deg,#2A2158,#0E0A24)', tx: '#FFFFFF', edge: 'rgba(243,217,124,.65)', base: '#1B1540', layout: 'wm', art: 'zgold', op: 0.32, medal: '🌙' },
  { id: 'starlit', name: 'Starlit Blue', bg: 'linear-gradient(155deg,#3E51C8,#141C4A)', tx: '#FFFFFF', edge: 'rgba(243,217,124,.6)', base: '#26317E', layout: 'wm', art: 'zwhite', op: 0.30, medal: '✨' },
  { id: 'rose', name: 'Rose Nebula', bg: 'linear-gradient(150deg,#E972A6,#7A2E6B)', tx: '#FFFFFF', edge: 'rgba(243,217,124,.6)', base: '#B44E88', layout: 'wm', art: 'zwhite', op: 0.28, medal: '🎁' },
  { id: 'emerald', name: 'Emerald Oracle', bg: 'linear-gradient(150deg,#33B488,#0E4B3A)', tx: '#FFFFFF', edge: 'rgba(243,217,124,.6)', base: '#1C7A5C', layout: 'wm', art: 'zgold', op: 0.30, medal: '🎁' },
  { id: 'plum', name: 'Royal Plum', bg: 'linear-gradient(150deg,#7A3061,#2E1430)', tx: '#FFFFFF', edge: 'rgba(243,217,124,.6)', base: '#552248', layout: 'wm', art: 'zgold', op: 0.32, medal: '🎁' },
  { id: 'cosmicdusk', name: 'Cosmic Dusk', bg: 'linear-gradient(145deg,#2B2417,#C0567E,#E8873A)', tx: '#FFFFFF', edge: 'rgba(255,255,255,.55)', base: '#A85C9A', layout: 'wm', art: 'zwhite', op: 0.26, medal: '✨' },
  { id: 'golden', name: 'Golden Hour', bg: 'linear-gradient(140deg,#F6CB6A,#DE982F)', tx: '#3A2600', edge: 'rgba(58,38,0,.45)', base: '#EDAE49', accent: 'linear-gradient(120deg,#20190F,#3A2A6E)', accentTx: '#FFFFFF', layout: 'split', art: 'gift', medal: '🎁' },
  { id: 'gift', name: 'Gilded Gift', bg: 'linear-gradient(135deg,#FFF9EC,#E4D6FA)', tx: '#2A2350', edge: 'rgba(231,184,75,.8)', base: '#E7DAFA', layout: 'split', art: 'gift', medal: '🎁' },
  { id: 'lotus', name: 'Sacred Lotus', bg: 'linear-gradient(135deg,#3A2A6E,#241247)', tx: '#FFFFFF', edge: 'rgba(243,217,124,.7)', base: '#301E5A', layout: 'split', art: 'mandala', medal: '🪔' },
  { id: 'saffron', name: 'Festive Saffron', bg: 'linear-gradient(150deg,#F2A73E,#C0473F)', tx: '#FFF7E6', edge: 'rgba(255,247,230,.65)', base: '#DE7A3E', accent: 'linear-gradient(120deg,#20190F,#3A2A6E)', accentTx: '#FFFFFF', layout: 'split', art: 'mandala', medal: '🪔' },
  { id: 'palace', name: 'Palace Dusk', bg: 'linear-gradient(180deg,rgba(30,18,60,.15),rgba(18,10,38,.9))', tx: '#FFFFFF', edge: 'rgba(243,217,124,.6)', base: '#241A44', layout: 'photo', art: 'scenery', medal: '✨' },
  { id: 'twilight', name: 'Twilight Peaks', bg: 'linear-gradient(180deg,rgba(20,26,70,.35),rgba(10,14,44,.92))', tx: '#FFFFFF', edge: 'rgba(180,200,255,.5)', base: '#161B45', layout: 'photo', art: 'scenery', medal: '🌌' },
  { id: 'teal', name: 'Mystic Teal', bg: 'linear-gradient(150deg,#1E7E7E,#0C2E33)', tx: '#FFFFFF', edge: 'rgba(243,217,124,.6)', base: '#155454', layout: 'wm', art: 'zgold', op: 0.28, medal: '✨' },
  { id: 'sunburst', name: 'Sunburst', bg: 'radial-gradient(120% 120% at 30% 20%,#FFC94D,#E8873A)', tx: '#4A2400', edge: 'rgba(74,36,0,.4)', base: '#F0A043', accent: 'linear-gradient(120deg,#20190F,#3A2A6E)', accentTx: '#FFFFFF', layout: 'split', art: 'gift', medal: '☀️' },
  { id: 'obsidian', name: 'Obsidian', bg: 'linear-gradient(155deg,#201C2E,#0A0910)', tx: '#FFFFFF', edge: 'rgba(243,217,124,.7)', base: '#161320', layout: 'wm', art: 'zgold', op: 0.34, medal: '🌟' },
];

export const themeById = (id?: string | null): PromoTheme | undefined =>
  id ? PROMO_THEMES.find((t) => t.id === id) : undefined;

// Relative luminance of a #rrggbb colour (0 = black, 1 = white).
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length < 6) return 1;
  const c = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

// Mirrors the app's promoHeadline(): gold on dark grounds (reads richly), the
// theme's own text colour on light grounds (where gold would wash out).
export const headlineColor = (t: PromoTheme): string =>
  luminance(t.base) < 0.45 ? '#FFE9B8' : t.tx;
