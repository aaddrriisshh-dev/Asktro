import 'package:flutter/material.dart';

/// ZODIA color palette (Part 2). Very light lavender, white cards, soft
/// purple accent. No dark mode in v1, but tokens are centralized so a dark
/// variant can be added without touching widgets.
abstract final class AppColors {
  // Backgrounds & surfaces
  static const Color background = Color(0xFFFFFFFF);
  static const Color card = Color(0xFFFFFFFF);
  static const Color accentLavender = Color(0xFFFFF3D6);

  // Brand purples
  static const Color primary = Color(0xFF2B2417);
  static const Color secondary = Color(0xFFD9B25A);

  // Text
  static const Color textDark = Color(0xFF2E2E2E);
  static const Color textSecondary = Color(0xFF7D7D7D);

  // Lines
  static const Color border = Color(0xFFECECEC);

  // Semantic
  static const Color success = Color(0xFF3CB371);
  static const Color warning = Color(0xFFF5A623);
  static const Color error = Color(0xFFD64545);

  // Online / presence
  static const Color online = Color(0xFF3CB371);
  static const Color offline = Color(0xFFBDBDBD);

  /// Primary purple gradient used on buttons, banners, balance card.
  static const LinearGradient primaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF5A4A1E), Color(0xFF231D12)],
  );

  /// Softer lavender gradient for banner/section backgrounds.
  static const LinearGradient lavenderGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFFFF9EC), Color(0xFFE7DBFF)],
  );
}
