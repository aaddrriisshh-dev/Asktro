import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// ASKTRO onboarding design system — the single source of truth for the
/// celestial navy/gold look. Tokens below are the approved design spec; change
/// them here and every onboarding screen updates. Kept local to this feature so
/// the rest of the app is unaffected until we roll the system out app-wide.
///
///   Fonts   headings Cormorant Garamond · body/buttons Poppins
///   Colors  bg #F5F2FF · text #2E2B5F/#7A7693 · gold #D4AF37 · border #E8E1F8
///   Spacing pad 24 · section 32 · card 20 · radii btn18/input16/card24
abstract final class Ob {
  // ---- palette ----
  static const Color bgColor = Color(0xFFF5F2FF);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color navy = Color(0xFF2E2B5F); // primary text
  static const Color grey = Color(0xFF7A7693); // secondary text
  static const Color gold = Color(0xFFD4AF37);
  static const Color goldDeep = Color(0xFFB8942A);
  static const Color border = Color(0xFFE8E1F8);
  static const Color purple = Color(0xFF7E57C2);
  static const Color purpleDeep = Color(0xFF5E3FBE);
  static const Color lavender = Color(0xFFF1ECFB);
  static const Color lavenderChip = Color(0xFFEDE6FA);

  // selection (gold tint)
  static const Color selectedFill = Color(0xFFFBF4DC);
  static const Color selectedBorder = Color(0xFFE4C55C);

  static const LinearGradient goldGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFEAD079), Color(0xFFD4AF37)],
  );
  static const LinearGradient goldCircle = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFEBD27C), Color(0xFFCFA834)],
  );

  // ---- spacing / sizing tokens ----
  static const double screenPad = 24;
  static const double section = 32;
  static const double cardPad = 20;
  static const double btnHeight = 56;
  static const double btnRadius = 18;
  static const double inputRadius = 16;
  static const double cardRadius = 24;
  static const double illoTop = 40;

  // ---- shadows (very soft: y8, blur24, 8%) ----
  static List<BoxShadow> get softShadow => const [
        BoxShadow(color: Color(0x1419123A), blurRadius: 24, offset: Offset(0, 8)),
      ];
  static List<BoxShadow> get goldShadow => [
        BoxShadow(color: gold.withValues(alpha: 0.34), blurRadius: 20, offset: const Offset(0, 8)),
      ];

  // ---- type ----
  static TextStyle _h(double s, FontWeight w, Color c) =>
      GoogleFonts.cormorantGaramond(fontSize: s, fontWeight: w, color: c, height: 1.1);
  static TextStyle _b(double s, FontWeight w, Color c) =>
      GoogleFonts.poppins(fontSize: s, fontWeight: w, color: c, height: 1.45);

  static TextStyle get hero => _h(46, FontWeight.w700, navy);
  static TextStyle get display => _h(40, FontWeight.w700, navy);
  static TextStyle get title => _h(34, FontWeight.w700, navy);
  static TextStyle get titleAccent => _h(34, FontWeight.w700, purple);
  static TextStyle get subtitle => _b(15, FontWeight.w400, grey);
  static TextStyle get subtitleLg => _b(19, FontWeight.w400, navy);
  static TextStyle get button => _b(17, FontWeight.w600, navy);
  static TextStyle get option => _b(16, FontWeight.w500, navy);
  static TextStyle get noteTitle => _b(14.5, FontWeight.w600, navy);
  static TextStyle get note => _b(13, FontWeight.w400, grey);
  static TextStyle get secure => _b(13, FontWeight.w500, grey);
  static TextStyle get sectionLabel => _b(15, FontWeight.w600, navy);
  static TextStyle get wheel => _b(20, FontWeight.w600, navy);
  static TextStyle get optionLabel => _h(24, FontWeight.w600, navy); // gender card labels

  // ---- assets ----
  static const String stars = 'assets/onboarding/dc_stars.png';
  static const String glow = 'assets/onboarding/dc_glow.png';
  static const String scenery = 'assets/onboarding/scenery.png';
  static const String gift = 'assets/onboarding/giftbox.webp';
  static const String ganesha = 'assets/onboarding/ganesha.webp';
  static const String zodiacWheel = 'assets/onboarding/zodiac_wheel.png';

  // decorative library
  static const String decoRing = 'assets/onboarding/deco_ring.png';
  static const String decoSwirl = 'assets/onboarding/deco_swirl.png';
  static const String decoConstellation = 'assets/onboarding/deco_constellation.png';
  static const String decoCloud = 'assets/onboarding/deco_cloud.png';
  static const String starFlare = 'assets/onboarding/star_flare.png';

  static const String ilName = 'assets/onboarding/il_name.png';
  static const String ilGender = 'assets/onboarding/il_gender.png';
  static const String ilDate = 'assets/onboarding/il_date.png';
  static const String ilTime = 'assets/onboarding/il_time.png';
  static const String ilPlace = 'assets/onboarding/il_place.png';
  static const String ilRel = 'assets/onboarding/il_rel.png';
  static const String ilLang = 'assets/onboarding/il_lang.png';
}
