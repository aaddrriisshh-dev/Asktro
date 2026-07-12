import 'dart:convert';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:http/http.dart' as http;
import 'package:shared_flutter/shared_flutter.dart';

/// Fetches a customer's kundli birth-chart SVG for the astrologer's in-chat
/// view, via the same `prokeralaAstrology` proxy the customer app uses. The
/// astrologer has the customer's birth date/time/place from the profile mirror;
/// coordinates come from the mirror when present, else a one-shot geocode of the
/// birth city. Results are cached in-memory per customer for the session so a
/// re-open (or expanding the card) never re-hits the paid API.
class CustomerKundliService {
  CustomerKundliService(this._fn);
  final FirebaseFunctions _fn;

  static final Map<String, String> _svgCache = {}; // uid -> chart svg

  /// Returns the chart SVG string, or null if it can't be produced (no birth
  /// place, geocode miss, or upstream error). Never throws.
  Future<String?> chartSvg(UserProfile profile) async {
    final uid = profile.id;
    if (uid.isNotEmpty && _svgCache.containsKey(uid)) return _svgCache[uid];

    final coords = await _coordinates(profile);
    if (coords == null) return null;
    final datetime = _birthDateTimeIso(profile);
    if (datetime == null) return null;

    try {
      final res = await _fn
          .httpsCallable(
            'prokeralaAstrology',
            options: HttpsCallableOptions(timeout: const Duration(seconds: 20)),
          )
          .call<Map<String, dynamic>>({
        'path': 'v2/astrology/chart',
        'params': {
          'datetime': datetime,
          'coordinates': coords,
          'ayanamsa': 1,
          'chart_type': 'rasi',
          'chart_style': 'north-indian',
          'la': 'en',
        },
      });
      final m = Map<String, dynamic>.from(res.data);
      if (m['ok'] != true) return null;
      final svg = (m['data'] is Map ? (m['data']['svg'] as String?) : null)?.trim();
      if (svg == null || svg.isEmpty) return null;
      if (uid.isNotEmpty) _svgCache[uid] = svg;
      return svg;
    } catch (_) {
      return null;
    }
  }

  Future<String?> _coordinates(UserProfile p) async {
    if (p.birthLat != null && p.birthLng != null) return '${p.birthLat},${p.birthLng}';
    final place = p.birthPlace;
    if (place == null || place.trim().isEmpty) return null;
    // One-shot India-restricted geocode (OpenStreetMap Nominatim), matching the
    // customer app's birth-place search.
    try {
      final uri = Uri.parse('https://nominatim.openstreetmap.org/search').replace(queryParameters: {
        'q': place.trim(),
        'format': 'jsonv2',
        'limit': '1',
        'countrycodes': 'in',
      },);
      final res = await http.get(uri, headers: {
        'User-Agent': 'AsktroAstrologer/1.0 (kundli chart)',
        'Accept': 'application/json',
      },).timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) return null;
      final data = jsonDecode(res.body);
      if (data is! List || data.isEmpty) return null;
      final e = data.first as Map;
      final lat = double.tryParse(e['lat']?.toString() ?? '');
      final lon = double.tryParse(e['lon']?.toString() ?? '');
      if (lat == null || lon == null) return null;
      return '$lat,$lon';
    } catch (_) {
      return null;
    }
  }

  String? _birthDateTimeIso(UserProfile p) {
    final ms = p.birthDateMs;
    if (ms == null) return null;
    final d = DateTime.fromMillisecondsSinceEpoch(ms);
    var hh = 12, mm = 0; // noon if the birth time is unknown
    if (p.birthTimeKnown && p.birthTime != null && p.birthTime!.contains(':')) {
      final parts = p.birthTime!.split(':');
      hh = int.tryParse(parts[0]) ?? 12;
      mm = int.tryParse(parts[1]) ?? 0;
    }
    String two(int n) => n.toString().padLeft(2, '0');
    return '${d.year.toString().padLeft(4, '0')}-${two(d.month)}-${two(d.day)}'
        'T${two(hh)}:${two(mm)}:00+05:30';
  }
}
