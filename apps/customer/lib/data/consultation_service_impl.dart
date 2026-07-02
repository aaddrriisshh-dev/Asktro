import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart' hide Result;
import 'package:shared_flutter/shared_flutter.dart';

/// Talks to the billing Cloud Functions. The client never computes money/time —
/// it invokes these callables and renders the authoritative responses.
class ConsultationServiceImpl implements ConsultationService {
  ConsultationServiceImpl(this._fn, this._db);
  final FirebaseFunctions _fn;
  final FirebaseFirestore _db;

  Future<Result<T>> _call<T>(
    String name,
    Map<String, dynamic> data,
    T Function(Map<String, dynamic>) parse,
  ) async {
    try {
      final res = await _fn.httpsCallable(name).call<Map<String, dynamic>>(data);
      return Success(parse(Map<String, dynamic>.from(res.data)));
    } on FirebaseFunctionsException catch (e) {
      if (e.message == 'INSUFFICIENT_BALANCE') return ResultFailure(Failure.insufficientBalance());
      return ResultFailure(Failure(message: e.message ?? 'Request failed', code: e.code));
    } catch (e) {
      return ResultFailure(Failure.unknown(e));
    }
  }

  @override
  Future<Result<StartConsultationResult>> create({
    required String astrologerId,
    required ConsultationType type,
  }) =>
      _call('createConsultation', {'astrologerId': astrologerId, 'type': type.name},
          (m) => StartConsultationResult(consultationId: m['consultationId'] as String));

  @override
  Future<Result<void>> activate(String consultationId) =>
      _call('activateConsultation', {'consultationId': consultationId}, (_) {});

  @override
  Future<Result<TickState>> tick(String consultationId, {String? networkStatus}) => _call(
        'tickConsultation',
        {'consultationId': consultationId, if (networkStatus != null) 'networkStatus': networkStatus},
        (m) => TickState(
          status: ConsultationStatus.fromString(m['status'] as String?),
          remainingSec: (m['remainingSec'] ?? 0) as int,
          warnLevel: (m['warnLevel'] ?? 0) as int,
          walletBalance: (m['walletBalance'] ?? 0) as int,
          bonusBalance: (m['bonusBalance'] ?? 0) as int,
        ),
      );

  @override
  Future<Result<void>> pause(String consultationId, {String? reason}) => _call(
      'pauseConsultation', {'consultationId': consultationId, if (reason != null) 'reason': reason}, (_) {});

  @override
  Future<Result<void>> resume(String consultationId) =>
      _call('resumeConsultation', {'consultationId': consultationId}, (_) {});

  @override
  Future<Result<Consultation>> end(String consultationId) async {
    final r = await _call('endConsultation', {'consultationId': consultationId}, (m) => m);
    return switch (r) {
      Success(:final value) => await _fetch(consultationId, value),
      ResultFailure(:final failure) => ResultFailure(failure),
    };
  }

  Future<Result<Consultation>> _fetch(String id, Map<String, dynamic> summary) async {
    try {
      final doc = await _db.collection('consultations').doc(id).get();
      return Success(Consultation.fromMap(id, doc.data() ?? summary));
    } catch (e) {
      return ResultFailure(Failure.unknown(e));
    }
  }

  @override
  Future<Result<void>> rate(String consultationId, {required double rating, String? review}) =>
      _call('rateConsultation',
          {'consultationId': consultationId, 'rating': rating, if (review != null) 'review': review}, (_) {});

  @override
  Stream<Consultation> watch(String consultationId) => _db
      .collection('consultations')
      .doc(consultationId)
      .snapshots()
      .where((d) => d.exists)
      .map((d) => Consultation.fromMap(d.id, d.data()!));
}
