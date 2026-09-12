import 'package:cloud_functions/cloud_functions.dart' hide Result;
import 'package:shared_flutter/shared_flutter.dart';

class RtcTokenServiceImpl implements RtcTokenService {
  RtcTokenServiceImpl(this._fn);
  final FirebaseFunctions _fn;

  @override
  Future<Result<AgoraCredentials>> tokenFor(String consultationId, {int agoraUid = 0}) async {
    try {
      // 45s cap so a stalled network fails into the "couldn't join" path instead
      // of leaving the customer stuck on "Connecting…" for the ~70s default.
      final res = await _fn
          .httpsCallable('generateAgoraToken', options: HttpsCallableOptions(timeout: const Duration(seconds: 45)))
          .call<Map<String, dynamic>>(
        {'consultationId': consultationId, 'agoraUid': agoraUid},
      );
      final m = Map<String, dynamic>.from(res.data);
      return Success(AgoraCredentials(
        token: m['token'] as String,
        appId: m['appId'] as String,
        channel: m['channel'] as String,
        uid: ((m['uid'] ?? 0) as num).toInt(),
      ),);
    } on FirebaseFunctionsException catch (e) {
      return ResultFailure(Failure(message: e.message ?? 'Could not join call', code: e.code));
    } catch (e) {
      return ResultFailure(Failure.unknown(e));
    }
  }
}
