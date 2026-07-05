import 'package:cloud_functions/cloud_functions.dart' hide Result;
import 'package:shared_flutter/shared_flutter.dart';

class WalletServiceImpl implements WalletService {
  WalletServiceImpl(this._fn);
  final FirebaseFunctions _fn;

  @override
  Future<Result<RechargeOrder>> createOrder(String planId, {String? couponId}) async {
    try {
      final res = await _fn.httpsCallable('createRechargeOrder').call<Map<String, dynamic>>(
        {'planId': planId, if (couponId != null) 'couponId': couponId},
      );
      final m = Map<String, dynamic>.from(res.data);
      return Success(RechargeOrder(
        orderId: m['orderId'] as String,
        amount: (m['amount'] ?? 0) as int,
        currency: (m['currency'] ?? 'INR') as String,
        keyId: m['keyId'] as String,
        planId: m['planId'] as String,
      ),);
    } on FirebaseFunctionsException catch (e) {
      return ResultFailure(Failure(message: e.message ?? 'Could not start recharge', code: e.code));
    } catch (e) {
      return ResultFailure(Failure.unknown(e));
    }
  }

  @override
  Future<Result<int>> verify({
    required String orderId,
    required String paymentId,
    required String signature,
    required String planId,
    String? couponId,
  }) async {
    try {
      final res = await _fn.httpsCallable('verifyRecharge').call<Map<String, dynamic>>({
        'orderId': orderId,
        'paymentId': paymentId,
        'signature': signature,
        'planId': planId,
        if (couponId != null) 'couponId': couponId,
      });
      final m = Map<String, dynamic>.from(res.data);
      return Success((m['newBalancePaise'] ?? 0) as int);
    } on FirebaseFunctionsException catch (e) {
      return ResultFailure(Failure(message: e.message ?? 'Payment verification failed', code: e.code));
    } catch (e) {
      return ResultFailure(Failure.unknown(e));
    }
  }

  @override
  Future<Result<CouponValidation>> validateCoupon(String code, {required String planId}) async {
    try {
      final res = await _fn.httpsCallable('validateCoupon').call<Map<String, dynamic>>(
        {'code': code, 'planId': planId},
      );
      final m = Map<String, dynamic>.from(res.data);
      return Success(CouponValidation(
        couponId: (m['couponId'] ?? '') as String,
        discountPaise: (m['discountPaise'] ?? 0) as int,
      ),);
    } on FirebaseFunctionsException catch (e) {
      return ResultFailure(Failure(message: e.message ?? 'Invalid coupon', code: e.code));
    } catch (e) {
      return ResultFailure(Failure.unknown(e));
    }
  }
}
