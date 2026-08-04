import 'package:cloud_functions/cloud_functions.dart' hide Result;
import 'package:shared_flutter/shared_flutter.dart';

class RtcTokenServiceImpl implements RtcTokenService {
  RtcTokenServiceImpl(this._fn);
  final FirebaseFunctions _fn;

  @override
  Future<Result<AgoraCredentials>> tokenFor(String consultationId, {int agoraUid = 0}) async {
    try {
      final res = await _fn.httpsCallable('generateAgoraToken').call<Map<String, dynamic>>(
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
