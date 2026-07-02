import 'package:flutter/material.dart';

/// ASKTRO color palette (Part 2). Very light lavender, white cards, soft
/// purple accent. No dark mode in v1, but tokens are centralized so a dark
/// variant can be added without touching widgets.
abstract final class AppColors {
  // Backgrounds & surfaces
  static const Color background = Color(0xFFF8F5FF);
  static const Color card = Color(0xFFFFFFFF);
  static const Color accentLavender = Color(0xFFEEE6FF);

  // Brand purples
  static const Color primary = Color(0xFF7E57C2);
  static const Color secondary = Color(0xFFB39DDB);

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
    colors: [Color(0xFF8E6BD1), Color(0xFF6A44B0)],
  );

  /// Softer lavender gradient for banner/section backgrounds.
  static const LinearGradient lavenderGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFF3ECFF), Color(0xFFE7DBFF)],
  );
}
