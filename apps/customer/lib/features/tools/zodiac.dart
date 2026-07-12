/// Western (sun) zodiac sign derived from a birth date, with display name and
/// symbol. Used to personalise the daily horoscope from the birth date we
/// already collect during onboarding.
class ZodiacSign {
  const ZodiacSign(this.name, this.symbol, this.dates);
  final String name; // API expects capitalised english name, e.g. "Aries"
  final String symbol; // ♈ etc.
  final String dates; // human range, e.g. "Mar 21 – Apr 19"

  static ZodiacSign fromDate(DateTime d) {
    final m = d.month, day = d.day;
    bool inRange(int m1, int d1, int m2, int d2) {
      // handles ranges within a year and across year end (Capricorn)
      final after = m > m1 || (m == m1 && day >= d1);
      final before = m < m2 || (m == m2 && day <= d2);
      if (m1 <= m2) return after && before;
      return after || before; // wraps year end
    }

    if (inRange(3, 21, 4, 19)) return const ZodiacSign('Aries', '♈', 'Mar 21 – Apr 19');
    if (inRange(4, 20, 5, 20)) return const ZodiacSign('Taurus', '♉', 'Apr 20 – May 20');
    if (inRange(5, 21, 6, 20)) return const ZodiacSign('Gemini', '♊', 'May 21 – Jun 20');
    if (inRange(6, 21, 7, 22)) return const ZodiacSign('Cancer', '♋', 'Jun 21 – Jul 22');
    if (inRange(7, 23, 8, 22)) return const ZodiacSign('Leo', '♌', 'Jul 23 – Aug 22');
    if (inRange(8, 23, 9, 22)) return const ZodiacSign('Virgo', '♍', 'Aug 23 – Sep 22');
    if (inRange(9, 23, 10, 22)) return const ZodiacSign('Libra', '♎', 'Sep 23 – Oct 22');
    if (inRange(10, 23, 11, 21)) return const ZodiacSign('Scorpio', '♏', 'Oct 23 – Nov 21');
    if (inRange(11, 22, 12, 21)) return const ZodiacSign('Sagittarius', '♐', 'Nov 22 – Dec 21');
    if (inRange(1, 20, 2, 18)) return const ZodiacSign('Aquarius', '♒', 'Jan 20 – Feb 18');
    if (inRange(2, 19, 3, 20)) return const ZodiacSign('Pisces', '♓', 'Feb 19 – Mar 20');
    return const ZodiacSign('Capricorn', '♑', 'Dec 22 – Jan 19');
  }

  static const all = [
    ZodiacSign('Aries', '♈', 'Mar 21 – Apr 19'),
    ZodiacSign('Taurus', '♉', 'Apr 20 – May 20'),
    ZodiacSign('Gemini', '♊', 'May 21 – Jun 20'),
    ZodiacSign('Cancer', '♋', 'Jun 21 – Jul 22'),
    ZodiacSign('Leo', '♌', 'Jul 23 – Aug 22'),
    ZodiacSign('Virgo', '♍', 'Aug 23 – Sep 22'),
    ZodiacSign('Libra', '♎', 'Sep 23 – Oct 22'),
    ZodiacSign('Scorpio', '♏', 'Oct 23 – Nov 21'),
    ZodiacSign('Sagittarius', '♐', 'Nov 22 – Dec 21'),
    ZodiacSign('Capricorn', '♑', 'Dec 22 – Jan 19'),
    ZodiacSign('Aquarius', '♒', 'Jan 20 – Feb 18'),
    ZodiacSign('Pisces', '♓', 'Feb 19 – Mar 20'),
  ];

  /// Traditional Vedic/Western associations for this sign (element, ruling
  /// planet, lucky colour/number/day/gem). Fixed per sign — used to enrich the
  /// daily horoscope with a "cosmic snapshot".
  ZodiacTraits get traits => ZodiacTraits._byName[name] ?? ZodiacTraits._byName['Aries']!;
}

/// Fixed astrological associations for a sign. These are the classical
/// correspondences (not day-to-day predictions), so they're safe to hard-code.
class ZodiacTraits {
  const ZodiacTraits({
    required this.element,
    required this.rulingPlanet,
    required this.quality,
    required this.luckyColor,
    required this.luckyColorHex,
    required this.luckyNumber,
    required this.luckyDay,
    required this.gemstone,
  });

  final String element; // Fire / Earth / Air / Water
  final String rulingPlanet;
  final String quality; // Cardinal / Fixed / Mutable
  final String luckyColor;
  final int luckyColorHex;
  final String luckyNumber;
  final String luckyDay;
  final String gemstone;

  static const _byName = <String, ZodiacTraits>{
    'Aries': ZodiacTraits(
        element: 'Fire', rulingPlanet: 'Mars', quality: 'Cardinal',
        luckyColor: 'Red', luckyColorHex: 0xFFD1495B, luckyNumber: '9', luckyDay: 'Tuesday', gemstone: 'Red Coral',),
    'Taurus': ZodiacTraits(
        element: 'Earth', rulingPlanet: 'Venus', quality: 'Fixed',
        luckyColor: 'Green', luckyColorHex: 0xFF3E8E7E, luckyNumber: '6', luckyDay: 'Friday', gemstone: 'Diamond',),
    'Gemini': ZodiacTraits(
        element: 'Air', rulingPlanet: 'Mercury', quality: 'Mutable',
        luckyColor: 'Yellow', luckyColorHex: 0xFFE0A100, luckyNumber: '5', luckyDay: 'Wednesday', gemstone: 'Emerald',),
    'Cancer': ZodiacTraits(
        element: 'Water', rulingPlanet: 'Moon', quality: 'Cardinal',
        luckyColor: 'Silver', luckyColorHex: 0xFF8892A6, luckyNumber: '2', luckyDay: 'Monday', gemstone: 'Pearl',),
    'Leo': ZodiacTraits(
        element: 'Fire', rulingPlanet: 'Sun', quality: 'Fixed',
        luckyColor: 'Gold', luckyColorHex: 0xFFC9992B, luckyNumber: '1', luckyDay: 'Sunday', gemstone: 'Ruby',),
    'Virgo': ZodiacTraits(
        element: 'Earth', rulingPlanet: 'Mercury', quality: 'Mutable',
        luckyColor: 'Olive', luckyColorHex: 0xFF6B7A3A, luckyNumber: '5', luckyDay: 'Wednesday', gemstone: 'Emerald',),
    'Libra': ZodiacTraits(
        element: 'Air', rulingPlanet: 'Venus', quality: 'Cardinal',
        luckyColor: 'Pink', luckyColorHex: 0xFFC96D8E, luckyNumber: '6', luckyDay: 'Friday', gemstone: 'Diamond',),
    'Scorpio': ZodiacTraits(
        element: 'Water', rulingPlanet: 'Mars', quality: 'Fixed',
        luckyColor: 'Maroon', luckyColorHex: 0xFF7E2E3C, luckyNumber: '9', luckyDay: 'Tuesday', gemstone: 'Red Coral',),
    'Sagittarius': ZodiacTraits(
        element: 'Fire', rulingPlanet: 'Jupiter', quality: 'Mutable',
        luckyColor: 'Amber', luckyColorHex: 0xFFC77E28, luckyNumber: '3', luckyDay: 'Thursday', gemstone: 'Yellow Sapphire',),
    'Capricorn': ZodiacTraits(
        element: 'Earth', rulingPlanet: 'Saturn', quality: 'Cardinal',
        luckyColor: 'Indigo', luckyColorHex: 0xFF3F4C7A, luckyNumber: '8', luckyDay: 'Saturday', gemstone: 'Blue Sapphire',),
    'Aquarius': ZodiacTraits(
        element: 'Air', rulingPlanet: 'Saturn', quality: 'Fixed',
        luckyColor: 'Sky Blue', luckyColorHex: 0xFF3A7CA5, luckyNumber: '8', luckyDay: 'Saturday', gemstone: 'Blue Sapphire',),
    'Pisces': ZodiacTraits(
        element: 'Water', rulingPlanet: 'Jupiter', quality: 'Mutable',
        luckyColor: 'Sea Green', luckyColorHex: 0xFF2E8B7F, luckyNumber: '3', luckyDay: 'Thursday', gemstone: 'Yellow Sapphire',),
  };
}
