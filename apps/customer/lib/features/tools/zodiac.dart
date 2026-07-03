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
}
