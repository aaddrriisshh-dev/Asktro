import 'dart:convert';
import 'package:http/http.dart' as http;

/// A single birth-place suggestion.
class PlaceResult {
  const PlaceResult({required this.label, this.lat, this.lon});
  final String label; // e.g. "Meerut, Uttar Pradesh, India"
  final double? lat;
  final double? lon;
}

/// Birth-place autocomplete backed by OpenStreetMap's Nominatim geocoder,
/// restricted to India (`countrycodes=in`) so it covers cities, towns and
/// villages. Free and keyless; for production scale this can be swapped for a
/// paid Places API without touching the UI. Callers should debounce input —
/// Nominatim's usage policy expects light, human-paced querying.
class PlaceSearchService {
  static final Uri _base = Uri.parse('https://nominatim.openstreetmap.org/search');

  Future<List<PlaceResult>> search(String query) async {
    final q = query.trim();
    if (q.length < 2) return const [];
    final uri = _base.replace(queryParameters: {
      'q': q,
      'format': 'jsonv2',
      'addressdetails': '1',
      'limit': '8',
      'countrycodes': 'in',
      'dedupe': '1',
    },);
    try {
      final res = await http.get(uri, headers: {
        // Nominatim requires an identifying User-Agent.
        'User-Agent': 'AsktroApp/1.0 (birth place search)',
        'Accept': 'application/json',
      },).timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) return const [];
      final data = jsonDecode(res.body);
      if (data is! List) return const [];
      final seen = <String>{};
      final out = <PlaceResult>[];
      for (final e in data) {
        if (e is! Map) continue;
        final a = (e['address'] as Map?) ?? const {};
        final primary = (a['village'] ??
                a['town'] ??
                a['city'] ??
                a['hamlet'] ??
                a['suburb'] ??
                a['municipality'] ??
                a['county'] ??
                e['name'] ??
                '')
            .toString();
        if (primary.isEmpty) continue;
        final region = (a['state'] ?? a['state_district'] ?? '').toString();
        final label = [primary, if (region.isNotEmpty) region, 'India'].join(', ');
        if (!seen.add(label)) continue;
        out.add(PlaceResult(
          label: label,
          lat: double.tryParse(e['lat']?.toString() ?? ''),
          lon: double.tryParse(e['lon']?.toString() ?? ''),
        ),);
      }
      return out;
    } catch (_) {
      return const [];
    }
  }
}
