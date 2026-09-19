import 'package:facebook_app_events/facebook_app_events.dart';

/// Meta (Facebook) app-events for ad measurement / optimisation.
///
/// We log three standard events, using Meta's canonical event names so they show
/// up as standard (not custom) events in Ads Manager:
///   • Complete registration  → after profile setup completes
///   • Add payment info        → when the Razorpay checkout opens
///   • Purchase (with ₹ value) → on a successful, server-verified recharge
///
/// Every call is best-effort and guarded: a logging failure must never affect
/// the user flow (a recharge or signup can't break because analytics threw).
///
/// Native config (App ID + client token) lives in:
///   • android/app/src/main/res/values/strings.xml + AndroidManifest.xml
///   • ios/Runner/Info.plist
class FacebookEvents {
  final FacebookAppEvents _fb = FacebookAppEvents();

  /// Standard Meta event: fb_mobile_complete_registration.
  Future<void> logCompleteRegistration({String method = 'phone'}) async {
    try {
      await _fb.logEvent(
        name: 'fb_mobile_complete_registration',
        parameters: {'fb_registration_method': method},
      );
    } catch (_) {/* never break signup over analytics */}
  }

  /// Standard Meta event: fb_mobile_add_payment_info.
  Future<void> logAddPaymentInfo({bool success = true}) async {
    try {
      await _fb.logEvent(
        name: 'fb_mobile_add_payment_info',
        parameters: {'fb_success': success ? 1 : 0},
      );
    } catch (_) {/* never break checkout over analytics */}
  }

  /// Standard Meta purchase event with a monetary value (rupees).
  Future<void> logPurchase({required double amount, String currency = 'INR'}) async {
    try {
      await _fb.logPurchase(amount: amount, currency: currency);
    } catch (_) {/* never break the recharge success flow over analytics */}
  }
}
