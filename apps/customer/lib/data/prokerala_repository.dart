import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:shared_flutter/shared_flutter.dart';

import 'prokerala_service.dart';
import 'place_search_service.dart';

/// Caches and serves ProKerala astrology data so the app hits the paid API as
/// little as possible:
///  - Kundli + chart: computed ONCE per user (birth details never change) and
///    stored under users/{uid}/astro/kundli.
///  - Daily horoscope: cached per sign per day.
///  - Panchang: cached per day (+ birth coordinates).
/// Ayanamsa 1 = Lahiri (the standard for Vedic/Indian astrology). Birth times
/// are interpreted in IST (+05:30) — the app's audience is India-based and the
/// birth-place search is restricted to India.
class ProkeralaRepository {
  ProkeralaRepository(this._svc, this._db, this._uid, {PlaceSearchService? places})
      : _places = places ?? PlaceSearchService();

  final ProkeralaService _svc;
  final FirebaseFirestore _db;
  final String _uid;
  final PlaceSearchService _places;

  CollectionReference<Map<String, dynamic>> get _cache =>
      _db.collection('users').doc(_uid).collection('astro');

  // --- Janam Kundli (chart image + details), computed once, then cached ------
  Future<KundliResult?> janamKundli(UserProfile p, {bool forceRefresh = false}) async {
    final coords = await _coordinatesFor(p);
    if (coords == null) return null; // no birth place → can't compute
    final datetime = _birthDateTimeIso(p);
    final key = _birthKey(datetime, coords);

    final doc = _cache.doc('kundli');
    if (!forceRefresh) {
      final snap = await doc.get();
      final d = snap.data();
      if (d != null && d['birthKey'] == key) {
        return KundliResult(
          data: Map<String, dynamic>.from(d['data'] as Map? ?? const {}),
          chartSvg: d['chartSvg'] as String?,
        );
      }
    }

    // Fetch the kundli data + the rendered chart SVG together.
    final params = {'datetime': datetime, 'coordinates': coords, 'ayanamsa': 1, 'la': 'en'};
    final results = await Future.wait([
      _svc.call('v2/astrology/kundli/advanced', params: params),
      _svc.call('v2/astrology/chart', params: {
        ...params,
        'chart_type': 'rasi',
        'chart_style': 'north-indian',
      },),
    ]);
    final data = results[0];
    if (data == null) return null; // upstream failure — caller shows a friendly error
    final chartSvg = (results[1]?['svg'] as String?)?.trim();

    await doc.set({
      'birthKey': key,
      'data': data,
      'chartSvg': chartSvg,
      'cachedAt': FieldValue.serverTimestamp(),
    });
    return KundliResult(data: data, chartSvg: (chartSvg?.isNotEmpty ?? false) ? chartSvg : null);
  }

  // --- helpers ---------------------------------------------------------------

  /// Birth coordinates as "lat,lng". Prefers the saved profile value; for older
  /// profiles that pre-date coordinate capture, geocodes the saved birth place
  /// once (and it gets persisted the next time they edit their profile).
  Future<String?> _coordinatesFor(UserProfile p) async {
    if (p.birthLat != null && p.birthLng != null) return '${p.birthLat},${p.birthLng}';
    final place = p.birthPlace;
    if (place == null || place.trim().isEmpty) return null;
    final hits = await _places.search(place);
    final first = hits.isNotEmpty ? hits.first : null;
    if (first?.lat != null && first?.lon != null) return '${first!.lat},${first.lon}';
    return null;
  }

  String _birthDateTimeIso(UserProfile p) {
    final ms = p.birthDateMs;
    final d = ms != null ? DateTime.fromMillisecondsSinceEpoch(ms) : DateTime(1990, 1, 1);
    var hh = 12, mm = 0; // noon when birth time is unknown (a sensible neutral)
    if (p.birthTimeKnown && p.birthTime != null && p.birthTime!.contains(':')) {
      final parts = p.birthTime!.split(':');
      hh = int.tryParse(parts[0]) ?? 12;
      mm = int.tryParse(parts[1]) ?? 0;
    }
    String two(int n) => n.toString().padLeft(2, '0');
    return '${d.year.toString().padLeft(4, '0')}-${two(d.month)}-${two(d.day)}'
        'T${two(hh)}:${two(mm)}:00+05:30';
  }

  String _birthKey(String datetime, String coords) => '$datetime|$coords';
}

/// A kundli reading: the rendered chart (SVG string) plus the raw ProKerala
/// `data` payload, accessed null-safely by the UI.
class KundliResult {
  const KundliResult({required this.data, this.chartSvg});
  final Map<String, dynamic> data;
  final String? chartSvg;

  Map<String, dynamic>? get _nakshatraDetails =>
      data['nakshatra_details'] is Map ? Map<String, dynamic>.from(data['nakshatra_details']) : null;

  Map<String, dynamic>? _sub(String key) {
    final n = _nakshatraDetails;
    return n != null && n[key] is Map ? Map<String, dynamic>.from(n[key]) : null;
  }

  String? get nakshatraName => _sub('nakshatra')?['name'] as String?;
  String? get nakshatraLord => (_sub('nakshatra')?['lord'] as Map?)?['name'] as String?;
  String? get chandraRasi => _sub('chandra_rasi')?['name'] as String?;
  String? get sooryaRasi => _sub('soorya_rasi')?['name'] as String?;
  String? get zodiac => _sub('zodiac')?['name'] as String?;

  Map<String, dynamic>? get mangalDosha =>
      data['mangal_dosha'] is Map ? Map<String, dynamic>.from(data['mangal_dosha']) : null;
  bool? get hasMangalDosha => mangalDosha?['has_dosha'] as bool?;
  String? get mangalDoshaDescription => mangalDosha?['description'] as String?;

  /// Yogas present in the chart, flattened to {name, description}. Handles both
  /// a flat list and the grouped `yoga_list` shape ProKerala can return.
  List<Map<String, dynamic>> get yogas {
    final out = <Map<String, dynamic>>[];
    final yd = data['yoga_details'];
    if (yd is List) {
      for (final group in yd) {
        if (group is! Map) continue;
        final list = group['yoga_list'];
        if (list is List) {
          for (final y in list) {
            if (y is Map && y['name'] != null) {
              out.add({'name': '${y['name']}', 'description': y['description']?.toString()});
            }
          }
        } else if (group['name'] != null) {
          out.add({'name': '${group['name']}', 'description': group['description']?.toString()});
        }
      }
    }
    return out;
  }

  /// Vimshottari Mahadasha periods as {name, start, end} (ISO date strings).
  List<Map<String, String?>> get dashaPeriods {
    final out = <Map<String, String?>>[];
    final dp = data['dasha_periods'];
    if (dp is List) {
      for (final d in dp) {
        if (d is Map && d['name'] != null) {
          out.add({'name': '${d['name']}', 'start': d['start']?.toString(), 'end': d['end']?.toString()});
        }
      }
    }
    return out;
  }
}
