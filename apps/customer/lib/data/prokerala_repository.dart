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

  // --- Daily horoscope (rich, per sign per day) ------------------------------
  /// Returns the ProKerala daily prediction `data` for [sign] (e.g. 'aries'),
  /// cached once per sign per day. Null on failure (caller falls back).
  Future<Map<String, dynamic>?> dailyHoroscope(String sign) async {
    final signLc = sign.toLowerCase();
    final day = _todayKey();
    final doc = _cache.doc('horoscope_${signLc}_$day');
    final snap = await doc.get();
    final cached = snap.data();
    if (cached != null && cached['data'] is Map) {
      return Map<String, dynamic>.from(cached['data'] as Map);
    }
    final data = await _svc.call('v2/horoscope/daily/advanced', params: {
      'datetime': _nowIso(),
      'sign': signLc,
    },);
    if (data == null) return null;
    await doc.set({'data': data, 'cachedAt': FieldValue.serverTimestamp()});
    return data;
  }

  // --- Kundali matching (guna milan) ----------------------------------------
  /// Compatibility between two births. Coordinates are "lat,lng"; datetimes are
  /// ISO8601 with the IST offset. Returns ProKerala's matching `data` (guna
  /// milan score, koota breakdown, message) or null on failure.
  Future<Map<String, dynamic>?> kundliMatch({
    required String girlDatetime,
    required String girlCoordinates,
    required String boyDatetime,
    required String boyCoordinates,
  }) {
    return _svc.call('v2/astrology/kundli-matching', params: {
      'girl_dob': girlDatetime,
      'girl_coordinates': girlCoordinates,
      'boy_dob': boyDatetime,
      'boy_coordinates': boyCoordinates,
      'ayanamsa': 1,
      'la': 'en',
    },);
  }

  /// Builds an ISO8601 (IST) datetime from a date, an optional 'HH:mm' time
  /// (noon if absent), for the matching form.
  String isoFor(DateTime date, String? hhmm) {
    var hh = 12, mm = 0;
    if (hhmm != null && hhmm.contains(':')) {
      final parts = hhmm.split(':');
      hh = int.tryParse(parts[0]) ?? 12;
      mm = int.tryParse(parts[1]) ?? 0;
    }
    String two(int n) => n.toString().padLeft(2, '0');
    return '${date.year.toString().padLeft(4, '0')}-${two(date.month)}-${two(date.day)}'
        'T${two(hh)}:${two(mm)}:00+05:30';
  }

  /// The signed-in user's own birth ISO + coordinates for matching (null if no
  /// birth place is on file).
  Future<({String datetime, String coordinates})?> selfBirth(UserProfile p) async {
    final coords = await _coordinatesFor(p);
    if (coords == null) return null;
    return (datetime: _birthDateTimeIso(p), coordinates: coords);
  }

  // --- Panchang (today's almanac) -------------------------------------------
  /// Today's panchang (tithi, nakshatra, yoga, karana, sunrise/sunset) for the
  /// user's location (falls back to New Delhi). Cached once per day.
  Future<Map<String, dynamic>?> panchang(UserProfile p) async {
    final coords = await _coordinatesFor(p) ?? _defaultCoords;
    final day = _todayKey();
    final doc = _cache.doc('panchang_$day');
    final snap = await doc.get();
    final cached = snap.data();
    if (cached != null && cached['data'] is Map) {
      return Map<String, dynamic>.from(cached['data'] as Map);
    }
    final data = await _svc.call('v2/astrology/panchang/advanced', params: {
      'datetime': _nowIso(),
      'coordinates': coords,
      'ayanamsa': 1,
      'la': 'en',
    },);
    if (data == null) return null;
    await doc.set({'data': data, 'cachedAt': FieldValue.serverTimestamp()});
    return data;
  }

  // --- Auspicious timings (muhurat / rahu kaal etc.) ------------------------
  /// Today's auspicious & inauspicious periods (rahu kaal, gulika, yamaganda,
  /// abhijit muhurat) for the user's location. Cached once per day.
  Future<Map<String, dynamic>?> auspiciousPeriod(UserProfile p) async {
    final coords = await _coordinatesFor(p) ?? _defaultCoords;
    final day = _todayKey();
    final doc = _cache.doc('auspicious_$day');
    final snap = await doc.get();
    final cached = snap.data();
    if (cached != null && cached['data'] is Map) {
      return Map<String, dynamic>.from(cached['data'] as Map);
    }
    final data = await _svc.call('v2/astrology/auspicious-period', params: {
      'datetime': _nowIso(),
      'coordinates': coords,
      'la': 'en',
    },);
    if (data == null) return null;
    await doc.set({'data': data, 'cachedAt': FieldValue.serverTimestamp()});
    return data;
  }

  static const _defaultCoords = '28.6139,77.2090'; // New Delhi

  String _todayKey() {
    final n = DateTime.now();
    String two(int x) => x.toString().padLeft(2, '0');
    return '${n.year}${two(n.month)}${two(n.day)}';
  }

  String _nowIso() {
    final n = DateTime.now();
    String two(int x) => x.toString().padLeft(2, '0');
    return '${n.year.toString().padLeft(4, '0')}-${two(n.month)}-${two(n.day)}'
        'T${two(n.hour)}:${two(n.minute)}:00+05:30';
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
