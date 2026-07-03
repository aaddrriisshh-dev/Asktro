import 'dart:convert';
import 'package:http/http.dart' as http;

/// Daily horoscope text for a zodiac sign.
///
/// Primary source is a free public API (horoscope-app-api). That service is
/// occasionally down, so [daily] never fails: on any error it returns a
/// locally-generated reading that varies by sign and day. The UI therefore
/// always has something to show.
class HoroscopeService {
  static const _base = 'https://horoscope-app-api.vercel.app/api/v1/get-horoscope';

  /// Returns a reading and whether it came from the live API. Never null.
  Future<HoroscopeResult> daily(String sign) async {
    final live = await _fetchLive(sign);
    if (live != null) return HoroscopeResult(live, live: true);
    return HoroscopeResult(_localReading(sign), live: false);
  }

  Future<String?> _fetchLive(String sign) async {
    final uri = Uri.parse('$_base/daily?sign=$sign&day=TODAY');
    try {
      final res = await http.get(uri).timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) return null;
      final body = jsonDecode(res.body);
      if (body is! Map) return null;
      final data = body['data'];
      if (data is! Map) return null;
      final text = data['horoscope_data'];
      return text is String && text.trim().isNotEmpty ? text.trim() : null;
    } catch (_) {
      return null;
    }
  }

  // --- Local fallback -------------------------------------------------------
  // A deterministic reading composed from a few fragments, seeded by the sign
  // and the day of the year, so it feels fresh each day and differs per sign.
  String _localReading(String sign) {
    final now = DateTime.now();
    final dayOfYear = now.difference(DateTime(now.year, 1, 1)).inDays;
    final signSeed = _signIndex(sign);
    int pick(List<String> list, int salt) => (dayOfYear + signSeed + salt) % list.length;

    final opening = _openings[pick(_openings, 0)];
    final focus = _focus[pick(_focus, 3)];
    final advice = _advice[pick(_advice, 7)];
    return '$opening $focus $advice';
  }

  int _signIndex(String sign) {
    final i = _order.indexOf(sign.toLowerCase());
    return i < 0 ? 0 : i;
  }

  static const _order = [
    'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
    'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
  ];

  static const _openings = [
    'The stars align gently in your favour today, bringing a calm, steady energy.',
    'A bright cosmic current runs through your day, lifting your spirits.',
    'The planets encourage you to slow down and trust your inner voice.',
    'Today carries a quiet promise — small moments will hold real meaning.',
    'Fresh energy surrounds you, opening the door to a hopeful day.',
    'The Moon favours reflection today, drawing your attention inward.',
    'A warm, grounding influence settles over your day, steadying your path.',
  ];

  static const _focus = [
    'Relationships take centre stage — a heartfelt conversation may bring you closer to someone who matters.',
    'Your focus at work is sharp; a task you have been putting off will feel lighter once you begin.',
    'Matters of money ask for patience — a thoughtful choice now will pay off later.',
    'Your health and energy are highlighted; a little rest will restore more than you expect.',
    'Creativity flows easily today, so give your ideas room to breathe.',
    'An old worry begins to loosen its grip, making space for something new.',
    'Family and home bring comfort — lean into the people who feel like belonging.',
  ];

  static const _advice = [
    'Trust your instincts and take one small, brave step forward.',
    'Let go of what you cannot control and the day will meet you halfway.',
    'A kind word — given or received — will change the shape of your evening.',
    'Stay open; an unexpected opportunity may arrive when you least expect it.',
    'Patience is your ally today; good things are quietly taking shape.',
    'Choose gratitude over worry and watch your outlook shift.',
    'Move at your own pace — there is no need to rush the stars.',
  ];
}

/// The reading plus whether it came from the live service (vs. local fallback).
class HoroscopeResult {
  const HoroscopeResult(this.text, {required this.live});
  final String text;
  final bool live;
}
