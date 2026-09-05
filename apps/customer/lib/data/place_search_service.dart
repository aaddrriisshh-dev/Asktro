import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;

/// A single birth-place suggestion.
class PlaceResult {
  const PlaceResult({required this.label, this.lat, this.lon});
  final String label; // e.g. "Meerut, Uttar Pradesh, India"
  final double? lat;
  final double? lon;
}

/// Birth-place autocomplete backed by an OFFLINE India atlas bundled with the
/// app (GeoNames — ~548k cities, towns and villages, each with coordinates and
/// state). This is instant, works on a weak/absent network, and has no rate
/// limits — the way AstroSage's own atlas works, and the right fit for a search
/// that runs once per user at onboarding.
///
/// The atlas is sharded by the first two letters of the (normalised) place name
/// under `assets/geo/`, so a search loads only a tiny slice, never the whole
/// file. Each shard is pre-sorted by population, so the best-known places for a
/// prefix surface first.
///
/// If a place isn't in the offline atlas (a rare tiny hamlet, or a foreign
/// birth place), we fall back to the online geocoder — hit rarely, so it stays
/// well within its limits.
class PlaceSearchService {
  static final Uri _base = Uri.parse('https://nominatim.openstreetmap.org/search');

  // One shard is cached at a time. While the user keeps typing within the same
  // two-letter prefix we filter the already-parsed list instead of reloading.
  String? _cachedKey;
  List<_Place>? _cachedShard;

  // GeoNames India admin1 code -> state/UT name.
  static const Map<String, String> _states = {
    '01': 'Andaman & Nicobar', '02': 'Andhra Pradesh', '03': 'Assam',
    '05': 'Chandigarh', '06': 'Dadra & Nagar Haveli', '07': 'Delhi',
    '09': 'Gujarat', '10': 'Haryana', '11': 'Himachal Pradesh',
    '12': 'Jammu & Kashmir', '13': 'Kerala', '14': 'Lakshadweep',
    '16': 'Maharashtra', '17': 'Manipur', '18': 'Meghalaya', '19': 'Karnataka',
    '20': 'Nagaland', '21': 'Odisha', '22': 'Puducherry', '23': 'Punjab',
    '24': 'Rajasthan', '25': 'Tamil Nadu', '26': 'Tripura', '28': 'West Bengal',
    '29': 'Sikkim', '30': 'Arunachal Pradesh', '31': 'Mizoram', '33': 'Goa',
    '34': 'Bihar', '35': 'Madhya Pradesh', '36': 'Uttar Pradesh',
    '37': 'Chhattisgarh', '38': 'Jharkhand', '39': 'Uttarakhand',
    '40': 'Telangana', '41': 'Ladakh', '52': 'Daman & Diu',
  };

  static final RegExp _nonAlnum = RegExp('[^a-z0-9]');
  String _norm(String s) => s.toLowerCase().replaceAll(_nonAlnum, '');

  Future<List<PlaceResult>> search(String query) async {
    final raw = query.trim();
    if (raw.length < 2) return const [];
    final q = _norm(raw);
    if (q.length < 2) return const [];

    final shard = await _loadShard(q.substring(0, 2));
    if (shard != null) {
      final out = <PlaceResult>[];
      for (final p in shard) {
        if (p.norm.startsWith(q)) {
          out.add(PlaceResult(label: p.label, lat: p.lat, lon: p.lon));
          if (out.length >= 12) break; // shard is pop-sorted: first hits are best
        }
      }
      if (out.isNotEmpty) return out;
    }
    // Not in the offline atlas — fall back to the online geocoder.
    return _online(raw);
  }

  Future<List<_Place>?> _loadShard(String key) async {
    if (_cachedKey == key) return _cachedShard;
    List<_Place>? list;
    try {
      final txt = await rootBundle.loadString('assets/geo/$key.txt');
      list = <_Place>[];
      for (final line in const LineSplitter().convert(txt)) {
        final f = line.split('\t');
        if (f.length < 4) continue;
        final name = f[0];
        final state = _states[f[1]] ?? '';
        final label = state.isEmpty ? '$name, India' : '$name, $state, India';
        list.add(_Place(
          norm: _norm(name),
          label: label,
          lat: double.tryParse(f[2]),
          lon: double.tryParse(f[3]),
        ));
      }
    } catch (_) {
      list = null; // no shard for this prefix
    }
    _cachedKey = key;
    _cachedShard = list;
    return list;
  }

  /// Online fallback (OpenStreetMap Nominatim, India). Only reached when the
  /// offline atlas has no match, so usage stays light.
  Future<List<PlaceResult>> _online(String query) async {
    final uri = _base.replace(queryParameters: {
      'q': query,
      'format': 'jsonv2',
      'addressdetails': '1',
      'limit': '8',
      'countrycodes': 'in',
      'dedupe': '1',
    });
    try {
      final res = await http.get(uri, headers: {
        'User-Agent': 'AsktroApp/1.0 (birth place search)',
        'Accept': 'application/json',
      }).timeout(const Duration(seconds: 8));
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
        ));
      }
      return out;
    } catch (_) {
      return const [];
    }
  }
}

class _Place {
  const _Place({required this.norm, required this.label, this.lat, this.lon});
  final String norm; // normalised name, for prefix matching
  final String label; // display "Name, State, India"
  final double? lat;
  final double? lon;
}
