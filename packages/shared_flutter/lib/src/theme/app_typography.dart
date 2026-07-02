import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app_colors.dart';

/// Typography (Part 2): Poppins, max five sizes.
/// Headline 32, Title 24, Subtitle 18, Body 16, Caption 14, Button 16 bold.
abstract final class AppTypography {
  static TextTheme textTheme() {
    final base = GoogleFonts.poppinsTextTheme();
    return base.copyWith(
      displaySmall: _s(32, FontWeight.w700, AppColors.textDark), // Headline
      headlineSmall: _s(24, FontWeight.w600, AppColors.textDark), // Title
      titleMedium: _s(18, FontWeight.w600, AppColors.textDark), // Subtitle
      bodyLarge: _s(16, FontWeight.w400, AppColors.textDark), // Body
      bodyMedium: _s(14, FontWeight.w400, AppColors.textSecondary), // Caption
      labelLarge: _s(16, FontWeight.w600, Colors.white), // Button
    );
  }

  static TextStyle _s(double size, FontWeight weight, Color color) =>
      GoogleFonts.poppins(fontSize: size, fontWeight: weight, color: color, height: 1.3);

  // Convenience getters for widgets that want a token directly.
  static TextStyle get headline => _s(32, FontWeight.w700, AppColors.textDark);
  static TextStyle get title => _s(24, FontWeight.w600, AppColors.textDark);
  static TextStyle get subtitle => _s(18, FontWeight.w600, AppColors.textDark);
  static TextStyle get body => _s(16, FontWeight.w400, AppColors.textDark);
  static TextStyle get caption => _s(14, FontWeight.w400, AppColors.textSecondary);
  static TextStyle get button => _s(16, FontWeight.w600, Colors.white);
}
