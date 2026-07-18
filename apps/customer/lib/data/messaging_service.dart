import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:shared_flutter/shared_flutter.dart';

import 'repositories.dart';

/// Registers the device FCM token against the signed-in user and requests push
/// permission. Keeps the token fresh on rotation (Part 7 push notifications).
class MessagingService {
  MessagingService(this._messaging, this._users);
  final FirebaseMessaging _messaging;
  final UserRepository _users;

  Future<void> registerFor(String uid) async {
    await _messaging.requestPermission();
    final token = await _messaging.getToken();
    // Guard the Firestore token write: if it runs before auth has fully settled
    // (or just after sign-out), the write is permission-denied and, unguarded,
    // crashes app startup. Best-effort — a missed token just means the next
    // launch/refresh re-registers it.
    try {
      if (token != null) await _users.registerFcmToken(uid, token);
    } catch (_) {/* non-fatal */}
    _messaging.onTokenRefresh.listen((t) => _users.registerFcmToken(uid, t).catchError((_) {}));
    // Subscribe to the all-users topic so mass broadcasts reach this device via
    // a single topic message (no per-user fan-out on the server).
    try {
      await _messaging.subscribeToTopic('all_users');
    } catch (_) {
      // Non-fatal: topic subscription can fail offline; per-user pushes still work.
    }
  }
}

/// Firebase Analytics implementation of the shared AnalyticsService contract.
class FirebaseAnalyticsService implements AnalyticsService {
  FirebaseAnalyticsService(this._analytics);
  final FirebaseAnalytics _analytics;

  @override
  Future<void> logEvent(String name, {Map<String, Object?> params = const {}}) {
    final clean = <String, Object>{};
    params.forEach((k, v) {
      if (v != null) clean[k] = v;
    });
    return _analytics.logEvent(name: name, parameters: clean.isEmpty ? null : clean);
  }

  @override
  Future<void> setUserId(String? id) => _analytics.setUserId(id: id);
}

/// Canonical analytics event names (Part 7).
abstract final class AnalyticsEvents {
  static const login = 'login';
  static const recharge = 'recharge';
  static const consultationStarted = 'consultation_started';
  static const consultationCompleted = 'consultation_completed';
  static const rechargePopup = 'recharge_popup';
  static const rechargeSuccess = 'recharge_success';
  static const rechargeCancelled = 'recharge_cancelled';
  static const couponUsed = 'coupon_used';
  static const referralUsed = 'referral_used';
  static const ratingSubmitted = 'rating_submitted';
}
