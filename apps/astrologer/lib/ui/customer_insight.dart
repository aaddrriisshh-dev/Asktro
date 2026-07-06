import 'package:shared_flutter/shared_flutter.dart';

/// Derives readable, astrologer-facing facts from a customer's profile.
/// Everything here is computed from real fields the customer entered
/// (birth date/time/place, gender). The deeper chart values (Moon sign,
/// Ascendant, Dashas, yogas) need an ephemeris engine — surfaced as a clearly
/// pending state rather than faked.
class CustomerInsight {
  CustomerInsight(this.profile);
  final UserProfile? profile;

  static const _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  DateTime? get _birth =>
      profile?.birthDateMs == null ? null : DateTime.fromMillisecondsSinceEpoch(profile!.birthDateMs!);

  int? get age {
    final b = _birth;
    if (b == null) return null;
    // Age uses a fixed reference is impossible here; approximate from the
    // stored date against a rolling "now" is fine for display.
    final now = DateTime.fromMillisecondsSinceEpoch(
        DateTime.now().millisecondsSinceEpoch); // wrapped for clarity
    var a = now.year - b.year;
    if (now.month < b.month || (now.month == b.month && now.day < b.day)) a--;
    return a < 0 ? null : a;
  }

  String get genderLabel {
    switch (profile?.gender) {
      case 'male':
        return 'Male';
      case 'female':
        return 'Female';
      default:
        return '—';
    }
  }

  String get relationshipLabel {
    switch (profile?.relationshipStatus) {
      case 'married':
        return 'Married';
      case 'single':
        return 'Single';
      case 'divorced':
        return 'Divorced';
      case 'in_relationship':
        return 'In a relationship';
      default:
        return '—';
    }
  }

  String get birthDate {
    final b = _birth;
    if (b == null) return 'Not provided';
    return '${b.day} ${_months[b.month - 1]} ${b.year}';
  }

  String get birthTime {
    if (profile?.birthTimeKnown == false) return 'Time unknown';
    final t = profile?.birthTime;
    return (t == null || t.isEmpty) ? 'Not provided' : t;
  }

  String get birthPlace => (profile?.birthPlace?.trim().isNotEmpty ?? false) ? profile!.birthPlace!.trim() : 'Not provided';

  bool get hasBirthTime => profile?.birthTimeKnown != false && (profile?.birthTime?.isNotEmpty ?? false);

  /// Tropical Sun sign — a real, correct computation from the birth date. The
  /// remaining chart values are intentionally left pending a kundli engine.
  String get sunSign {
    final b = _birth;
    if (b == null) return '—';
    final d = b.day, m = b.month;
    const cusp = [20, 19, 21, 20, 21, 21, 23, 23, 23, 23, 22, 22];
    const signs = [
      'Capricorn', 'Aquarius', 'Pisces', 'Aries', 'Taurus', 'Gemini',
      'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius'
    ];
    final idx = d < cusp[m - 1] ? m - 1 : m % 12;
    return signs[idx];
  }
}
