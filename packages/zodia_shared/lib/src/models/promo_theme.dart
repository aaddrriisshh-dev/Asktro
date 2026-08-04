import 'package:flutter/widgets.dart';

/// Layout family for a promo theme:
///  - split: a hero art (gift / mandala) sits beside the text on the small card
///    and becomes a centred hero on full-screen.
///  - wm: a zodiac-wheel watermark sits behind the text at low opacity.
///  - photo: a full-bleed scenery photo with a dark scrim.
enum PromoLayout { split, wm, photo }

/// A celestial promo theme. Mirrors the portal catalog (apps/admin …
/// promoThemes.ts) BY ID, so a theme picked in the composer renders identically
/// in the app. The customer app maps `art` to bundled assets and tints the
/// zodiac wheel white/gold at runtime.
class PromoTheme {
  const PromoTheme({
    required this.id,
    required this.name,
    required this.medal,
    required this.bg,
    required this.tx,
    required this.edge,
    required this.layout,
    this.art,
    this.op = 0.30,
    this.radial = false,
    this.accent,
    this.accentTx,
  });

  final String id;
  final String name;
  final String medal;

  /// Gradient stops. For `photo` these are the dark scrim stops drawn over the
  /// scenery photo.
  final List<Color> bg;
  final Color tx;
  final Color edge;
  final PromoLayout layout;

  /// 'gift' | 'mandala' | 'scenery' | 'zwhite' | 'zgold' | 'zviolet'
  final String? art;
  final double op;
  final bool radial;

  /// Reward/CTA chip gradient; null → default gold.
  final List<Color>? accent;
  final Color? accentTx;

  bool get isPhoto => layout == PromoLayout.photo;
}

// Shared accents.
const List<Color> kPromoGoldAccent = [Color(0xFFFFE9B8), Color(0xFFE7B84B)];
const List<Color> _violetAccent = [Color(0xFF20190F), Color(0xFF17120A)];

/// The 20 celestial themes, keyed by the same ids as the portal.
const List<PromoTheme> kPromoThemes = [
  PromoTheme(id: 'white', name: 'Clean White', medal: '🎁', bg: [Color(0xFFFFFFFF), Color(0xFFFFFFFF)], tx: Color(0xFF17120A), edge: Color(0xE6E7B84B), layout: PromoLayout.split, art: 'gift'),
  PromoTheme(id: 'ivory', name: 'Ivory Gold', medal: '🪔', bg: [Color(0xFFFFF8E9), Color(0xFFF3E4C2)], tx: Color(0xFF4A3A12), edge: Color(0xBFC88C28), layout: PromoLayout.split, art: 'mandala'),
  PromoTheme(id: 'blush', name: 'Blush Petal', medal: '🎁', bg: [Color(0xFFFDEEF4), Color(0xFFF6D6E4)], tx: Color(0xFF5A2A46), edge: Color(0xCCD278A0), layout: PromoLayout.split, art: 'gift'),
  PromoTheme(id: 'lunar', name: 'Lunar Silver', medal: '🌙', bg: [Color(0xFFF5F0FD), Color(0xFFDBD0F2)], tx: Color(0xFF2B2450), edge: Color(0x802B2417), layout: PromoLayout.wm, art: 'zviolet', op: 0.30),
  PromoTheme(id: 'amethyst', name: 'Amethyst', medal: '🎁', bg: [Color(0xFF9576E8), Color(0xFF20190F)], tx: Color(0xFFFFFFFF), edge: Color(0x99FFFFFF), layout: PromoLayout.wm, art: 'zwhite', op: 0.34),
  PromoTheme(id: 'midnight', name: 'Midnight Sky', medal: '🌙', bg: [Color(0xFF2A2158), Color(0xFF0E0A24)], tx: Color(0xFFFFFFFF), edge: Color(0xA6FFE9B8), layout: PromoLayout.wm, art: 'zgold', op: 0.32),
  PromoTheme(id: 'starlit', name: 'Starlit Blue', medal: '✨', bg: [Color(0xFF3E51C8), Color(0xFF141C4A)], tx: Color(0xFFFFFFFF), edge: Color(0x99FFE9B8), layout: PromoLayout.wm, art: 'zwhite', op: 0.30),
  PromoTheme(id: 'rose', name: 'Rose Nebula', medal: '🎁', bg: [Color(0xFFE972A6), Color(0xFF7A2E6B)], tx: Color(0xFFFFFFFF), edge: Color(0x99FFE9B8), layout: PromoLayout.wm, art: 'zwhite', op: 0.28),
  PromoTheme(id: 'emerald', name: 'Emerald Oracle', medal: '🎁', bg: [Color(0xFF33B488), Color(0xFF0E4B3A)], tx: Color(0xFFFFFFFF), edge: Color(0x99FFE9B8), layout: PromoLayout.wm, art: 'zgold', op: 0.30),
  PromoTheme(id: 'plum', name: 'Royal Plum', medal: '🎁', bg: [Color(0xFF7A3061), Color(0xFF2E1430)], tx: Color(0xFFFFFFFF), edge: Color(0x99FFE9B8), layout: PromoLayout.wm, art: 'zgold', op: 0.32),
  PromoTheme(id: 'cosmicdusk', name: 'Cosmic Dusk', medal: '✨', bg: [Color(0xFF2B2417), Color(0xFFC0567E), Color(0xFFE8873A)], tx: Color(0xFFFFFFFF), edge: Color(0x8CFFFFFF), layout: PromoLayout.wm, art: 'zwhite', op: 0.26),
  PromoTheme(id: 'golden', name: 'Golden Hour', medal: '🎁', bg: [Color(0xFFF6CB6A), Color(0xFFDE982F)], tx: Color(0xFF3A2600), edge: Color(0x733A2600), layout: PromoLayout.split, art: 'gift', accent: _violetAccent, accentTx: Color(0xFFFFFFFF)),
  PromoTheme(id: 'gift', name: 'Gilded Gift', medal: '🎁', bg: [Color(0xFFFFF9EC), Color(0xFFE4D6FA)], tx: Color(0xFF17120A), edge: Color(0xCCFFE9B8), layout: PromoLayout.split, art: 'gift'),
  PromoTheme(id: 'lotus', name: 'Sacred Lotus', medal: '🪔', bg: [Color(0xFF17120A), Color(0xFF241247)], tx: Color(0xFFFFFFFF), edge: Color(0xB3FFE9B8), layout: PromoLayout.split, art: 'mandala'),
  PromoTheme(id: 'saffron', name: 'Festive Saffron', medal: '🪔', bg: [Color(0xFFF2A73E), Color(0xFFC0473F)], tx: Color(0xFFFFF7E6), edge: Color(0xA6FFF7E6), layout: PromoLayout.split, art: 'mandala', accent: _violetAccent, accentTx: Color(0xFFFFFFFF)),
  PromoTheme(id: 'palace', name: 'Palace Dusk', medal: '✨', bg: [Color(0x261E123C), Color(0xE6120A26)], tx: Color(0xFFFFFFFF), edge: Color(0x99FFE9B8), layout: PromoLayout.photo, art: 'scenery'),
  PromoTheme(id: 'twilight', name: 'Twilight Peaks', medal: '🌌', bg: [Color(0x59141A46), Color(0xEB0A0E2C)], tx: Color(0xFFFFFFFF), edge: Color(0x80B4C8FF), layout: PromoLayout.photo, art: 'scenery'),
  PromoTheme(id: 'teal', name: 'Mystic Teal', medal: '✨', bg: [Color(0xFF1E7E7E), Color(0xFF0C2E33)], tx: Color(0xFFFFFFFF), edge: Color(0x99FFE9B8), layout: PromoLayout.wm, art: 'zgold', op: 0.28),
  PromoTheme(id: 'sunburst', name: 'Sunburst', medal: '☀️', bg: [Color(0xFFFFC94D), Color(0xFFE8873A)], tx: Color(0xFF4A2400), edge: Color(0x664A2400), layout: PromoLayout.split, art: 'gift', radial: true, accent: _violetAccent, accentTx: Color(0xFFFFFFFF)),
  PromoTheme(id: 'obsidian', name: 'Obsidian', medal: '🌟', bg: [Color(0xFF201C2E), Color(0xFF0A0910)], tx: Color(0xFFFFFFFF), edge: Color(0xB3FFE9B8), layout: PromoLayout.wm, art: 'zgold', op: 0.34),
];

/// Look up a theme by its id (null / unknown → null, so callers fall back to
/// the stored solid bgColor/textColor).
PromoTheme? promoThemeById(String? id) {
  if (id == null || id.isEmpty) return null;
  for (final t in kPromoThemes) {
    if (t.id == id) return t;
  }
  return null;
}
