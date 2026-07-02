import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Design tokens for the ASKTRO onboarding — a distinct navy + gold + serif
/// language (replicated from the product design), kept local to this feature so
/// it doesn't affect the rest of the app's purple/Poppins system.
///
/// Fonts are best-match Google Fonts: Playfair Display for the elegant serif
/// headings/buttons, Poppins for body. Swap `_heading` / `_body` here to change
/// them everywhere in onboarding at once.
abstract final class Ob {
  // ---- palette ----
  static const Color navy = Color(0xFF1B2140);
  static const Color navySoft = Color(0xFF2A2E52);
  static const Color purple = Color(0xFF7E57C2);
  static const Color purpleDeep = Color(0xFF5E3FBE);
  static const Color grey = Color(0xFF7C7A93);
  static const Color card = Color(0xFFFFFFFF);
  static const Color lavender = Color(0xFFF1ECFB);
  static const Color lavenderChip = Color(0xFFEDE6FA);
  static const Color line = Color(0xFFEDE8F6);

  // gold
  static const Color gold = Color(0xFFF3B928);
  static const Color goldDeep = Color(0xFFEBA019);
  static const Color goldSoft = Color(0xFFEBC974);
  static const Color selectedFill = Color(0xFFFCF4D6);
  static const Color selectedBorder = Color(0xFFF0C84C);

  static const LinearGradient goldGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFF7CE4F), Color(0xFFEEA51F)],
  );
  static const LinearGradient goldCircle = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFF9CD4B), Color(0xFFEFA824)],
  );

  static const LinearGradient bg = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFFF6F2FC), Color(0xFFEFE8FA)],
  );

  static List<BoxShadow> get softShadow => const [
        BoxShadow(color: Color(0x14000000), blurRadius: 22, offset: Offset(0, 10)),
      ];
  static List<BoxShadow> get goldShadow => [
        BoxShadow(color: gold.withValues(alpha: 0.42), blurRadius: 22, offset: const Offset(0, 10)),
      ];

  // ---- type ----
  static TextStyle _heading(double s, FontWeight w, Color c) =>
      GoogleFonts.playfairDisplay(fontSize: s, fontWeight: w, color: c, height: 1.15);
  static TextStyle _body(double s, FontWeight w, Color c) =>
      GoogleFonts.poppins(fontSize: s, fontWeight: w, color: c, height: 1.4);

  static TextStyle get display => _heading(34, FontWeight.w700, navy);
  static TextStyle get title => _heading(30, FontWeight.w600, navy);
  static TextStyle get titleAccent => _heading(30, FontWeight.w600, purpleDeep);
  static TextStyle get button => _heading(20, FontWeight.w600, navy);
  static TextStyle get subtitle => _body(15, FontWeight.w400, grey);
  static TextStyle get option => _body(17, FontWeight.w500, navy);
  static TextStyle get noteTitle => _body(15, FontWeight.w600, navy);
  static TextStyle get note => _body(13, FontWeight.w400, grey);
  static TextStyle get secure => _body(13, FontWeight.w500, grey);
  static TextStyle get sectionLabel => _body(15, FontWeight.w600, navy);
  static TextStyle get wheel => _body(20, FontWeight.w600, navy);
  static TextStyle get wheelFaint => _body(18, FontWeight.w400, const Color(0xFFBBB5CC));

  // ---- assets ----
  static const String zodiac = 'assets/onboarding/zodiac_wheel.png';
  static const String scenery = 'assets/onboarding/scenery.png';
  static const String gift = 'assets/onboarding/giftbox.png';
}
