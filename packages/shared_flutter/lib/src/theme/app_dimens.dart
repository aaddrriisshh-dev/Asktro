import 'package:flutter/material.dart';
import 'app_colors.dart';

/// Spacing scale (8pt-ish) — used everywhere for generous, consistent whitespace.
abstract final class AppSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;
  static const double xxxl = 48;
}

/// Border radii (Part 2): cards 24, buttons 18, sheets 30, dialogs 28, search 20.
abstract final class AppRadius {
  static const double card = 24;
  static const double button = 18;
  static const double sheet = 30;
  static const double dialog = 28;
  static const double search = 20;
  static const double chip = 14;

  static const BorderRadius cardR = BorderRadius.all(Radius.circular(card));
  static const BorderRadius buttonR = BorderRadius.all(Radius.circular(button));
  static const BorderRadius searchR = BorderRadius.all(Radius.circular(search));
  static const BorderRadius chipR = BorderRadius.all(Radius.circular(chip));
  static const BorderRadius sheetR =
      BorderRadius.vertical(top: Radius.circular(sheet));
}

/// Soft, floating shadows only — never hard drop shadows (Part 2).
abstract final class AppShadows {
  static const List<BoxShadow> card = [
    BoxShadow(
      color: Color(0x14000000), // ~8% black
      blurRadius: 24,
      offset: Offset(0, 8),
    ),
  ];

  static const List<BoxShadow> soft = [
    BoxShadow(
      color: Color(0x0F000000),
      blurRadius: 12,
      offset: Offset(0, 4),
    ),
  ];

  static List<BoxShadow> button(Color color) => [
        BoxShadow(
          color: color.withValues(alpha: 0.35),
          blurRadius: 18,
          offset: const Offset(0, 8),
        ),
      ];
}

/// Common sizing constants.
abstract final class AppSizes {
  static const double buttonHeight = 56;
  static const double avatarSm = 40;
  static const double avatarMd = 56;
  static const double avatarLg = 96;
  static const Duration tapAnim = Duration(milliseconds: 120);
  static const Duration pageAnim = Duration(milliseconds: 300);
}

/// Gradient border decoration helper reused by cards.
BoxDecoration softCardDecoration({Color color = AppColors.card, double radius = AppRadius.card}) {
  return BoxDecoration(
    color: color,
    borderRadius: BorderRadius.circular(radius),
    boxShadow: AppShadows.card,
  );
}
