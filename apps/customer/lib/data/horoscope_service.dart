import 'dart:convert';
import 'package:http/http.dart' as http;

/// Daily horoscope text for a zodiac sign, from a free public API
/// (horoscope-app-api). Keyless; for production this can move behind our own
/// Cloud Function/cache. Returns null on any failure so the UI can fall back.
class HoroscopeService {
  static const _base = 'https://horoscope-app-api.vercel.app/api/v1/get-horoscope';

  Future<String?> daily(String sign) async {
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
}
