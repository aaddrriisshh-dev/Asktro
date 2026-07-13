import 'package:cloud_functions/cloud_functions.dart' hide Result;

/// Thin client for the `prokeralaAstrology` Cloud Function proxy. The app never
/// talks to ProKerala directly — it calls this callable, which holds the
/// OAuth2 credentials server-side and forwards a whitelisted request. Every
/// astrology feature (daily horoscope, kundli, panchang, matching) goes through
/// [call] with the ProKerala path + query params; the raw `data` is returned.
class ProkeralaService {
  ProkeralaService(this._fn);
  final FirebaseFunctions _fn;

  /// Calls `path` (a ProKerala v2 path on the proxy whitelist) with [params] as
  /// the query string. Returns the ProKerala `data` payload, or null on any
  /// failure (network / not-configured / upstream) — callers fall back
  /// gracefully rather than crash.
  Future<Map<String, dynamic>?> call(
    String path, {
    Map<String, dynamic> params = const {},
  }) async {
    try {
      final res = await _fn
          .httpsCallable(
            'prokeralaAstrology',
            options: HttpsCallableOptions(timeout: const Duration(seconds: 20)),
          )
          .call<Map<String, dynamic>>({'path': path, 'params': params});
      final m = Map<String, dynamic>.from(res.data);
      if (m['ok'] != true) return null;
      final data = m['data'];
      return data is Map ? Map<String, dynamic>.from(data) : null;
    } catch (_) {
      return null;
    }
  }

  /// The PAID Kundali Match. Calls the server function that atomically charges
  /// the wallet (₹49) and returns the full report. Unlike [call], this does NOT
  /// swallow errors — it rethrows the `FirebaseFunctionsException` so the UI can
  /// react (e.g. code 'failed-precondition' with message 'INSUFFICIENT_BALANCE'
  /// → route to recharge). Returns the raw callable payload
  /// ({ data, charged, alreadyPurchased, pricePaise }).
  Future<Map<String, dynamic>> purchaseKundliMatch({
    required String girlDob,
    required String girlCoordinates,
    required String boyDob,
    required String boyCoordinates,
    String? selfName,
    String? partnerName,
  }) async {
    final res = await _fn
        .httpsCallable(
          'purchaseKundliMatch',
          options: HttpsCallableOptions(timeout: const Duration(seconds: 30)),
        )
        .call<Map<String, dynamic>>({
      'girlDob': girlDob,
      'girlCoordinates': girlCoordinates,
      'boyDob': boyDob,
      'boyCoordinates': boyCoordinates,
      if (selfName != null) 'selfName': selfName,
      if (partnerName != null) 'partnerName': partnerName,
    });
    return Map<String, dynamic>.from(res.data);
  }
}
