import '../models/consultation.dart';
import '../models/enums.dart';
import '../utils/result.dart';

/// Contracts implemented in each app's data layer against Firebase. Keeping them
/// here lets presentation/domain depend on abstractions (repository pattern).

/// Result of starting a consultation via Cloud Functions.
class StartConsultationResult {
  const StartConsultationResult({required this.consultationId});
  final String consultationId;
}

/// Live tick payload returned by the billing heartbeat.
class TickState {
  const TickState({
    required this.status,
    required this.remainingSec,
    required this.warnLevel,
    this.walletBalance = 0,
    this.bonusBalance = 0,
  });
  final ConsultationStatus status;
  final int remainingSec;
  final int warnLevel;
  final int walletBalance;
  final int bonusBalance;
}

/// The billing/consultation engine as seen by the client — a thin RPC wrapper
/// over Cloud Functions. Clients NEVER compute money or time; they call these.
abstract interface class ConsultationService {
  Future<Result<StartConsultationResult>> create({
    required String astrologerId,
    required ConsultationType type,
    String? requestedSkill,
  });

  Future<Result<void>> activate(String consultationId);

  /// Heartbeat — call ~every 10s while active. Returns authoritative state.
  Future<Result<TickState>> tick(String consultationId, {String? networkStatus});

  Future<Result<void>> pause(String consultationId, {String? reason});
  Future<Result<void>> resume(String consultationId);
  Future<Result<Consultation>> end(String consultationId);
  Future<Result<void>> rate(String consultationId,
      {required double rating, String? review, double? behaviorRating, double? accuracyRating,});

  /// Realtime stream of a single session (timer, wallet, status).
  Stream<Consultation> watch(String consultationId);
}

/// Agora token retrieval (voice/video). Minted server-side.
class AgoraCredentials {
  const AgoraCredentials({
    required this.token,
    required this.appId,
    required this.channel,
    required this.uid,
  });
  final String token;
  final String appId;
  final String channel;
  final int uid;
}

abstract interface class RtcTokenService {
  Future<Result<AgoraCredentials>> tokenFor(String consultationId, {int agoraUid = 0});
}

/// Wallet + recharge operations (all server-verified).
class RechargeOrder {
  const RechargeOrder({
    required this.orderId,
    required this.amount,
    required this.currency,
    required this.keyId,
    required this.planId,
  });
  final String orderId;
  final int amount;
  final String currency;
  final String keyId;
  final String planId;
}

class CouponValidation {
  const CouponValidation({required this.couponId, required this.discountPaise});
  final String couponId;
  final int discountPaise;
}

abstract interface class WalletService {
  Future<Result<RechargeOrder>> createOrder(String planId, {String? couponId});

  /// Verify a completed Razorpay checkout and credit the wallet.
  Future<Result<int>> verify({
    required String orderId,
    required String paymentId,
    required String signature,
    required String planId,
    String? couponId,
  });

  Future<Result<CouponValidation>> validateCoupon(String code, {required String planId});
}

/// Cross-cutting analytics contract (Part 7 events).
abstract interface class AnalyticsService {
  Future<void> logEvent(String name, {Map<String, Object?> params});
  Future<void> setUserId(String? id);
}

/// Cross-cutting crash reporting contract.
abstract interface class CrashReporter {
  Future<void> recordError(Object error, StackTrace? stack, {bool fatal});
  void log(String message);
}

/// Structured app logger (no `print`).
abstract interface class AppLogger {
  void debug(String message, [Object? data]);
  void info(String message, [Object? data]);
  void warn(String message, [Object? error]);
  void error(String message, [Object? error, StackTrace? stack]);
}
