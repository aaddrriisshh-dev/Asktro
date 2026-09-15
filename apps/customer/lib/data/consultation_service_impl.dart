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
      // A generous timeout so the call survives a slow token fetch on
      // emulators / weak networks (real devices resolve tokens instantly).
      final res = await _fn
          .httpsCallable(name, options: HttpsCallableOptions(timeout: const Duration(seconds: 120)))
          .call<Map<String, dynamic>>(data);
      return Success(parse(Map<String, dynamic>.from(res.data)));
    } on FirebaseFunctionsException catch (e) {
      if (e.message == 'INSUFFICIENT_BALANCE') return ResultFailure(Failure.insufficientBalance());
      // Never surface raw platform noise to the user. A failed auth/App-Check
      // token shows up as "java.util.concurrent.ExecutionException: 1 out of 2
      // underlying tasks failed" — meaningless and scary. Show the server's own
      // message only when it's a clean business message; otherwise a friendly
      // fallback.
      final raw = e.message ?? '';
      final isInternal = e.code == 'internal' ||
          e.code == 'unavailable' ||
          e.code == 'unauthenticated' ||
          e.code == 'deadline-exceeded' ||
          raw.contains('ExecutionException') ||
          raw.contains('underlying tasks') ||
          raw.contains('PlatformException');
      return ResultFailure(Failure(
        message: (isInternal || raw.isEmpty) ? 'Something went wrong. Please try again.' : raw,
        code: e.code,
      ),);
    } catch (e) {
      // Transport/SDK failure (e.g. a token fetch timing out on a fresh
      // emulator) — surface a friendly message, not a raw platform exception.
      return const ResultFailure(Failure(
        message: 'Couldn\'t reach the server. Check your connection and try again.',
        code: 'transport',
      ),);
    }
  }

  @override
  Future<Result<StartConsultationResult>> create({
    required String astrologerId,
    required ConsultationType type,
    String? requestedSkill,
  }) =>
      _call('createConsultation', {
        'astrologerId': astrologerId,
        'type': type.name,
        if (requestedSkill != null) 'requestedSkill': requestedSkill,
      }, (m) => StartConsultationResult(consultationId: m['consultationId'] as String),);

  @override
  Future<Result<void>> activate(String consultationId) =>
      _call('activateConsultation', {'consultationId': consultationId}, (_) {});

  @override
  Future<Result<TickState>> tick(String consultationId, {String? networkStatus}) => _call(
        'tickConsultation',
        {'consultationId': consultationId, if (networkStatus != null) 'networkStatus': networkStatus},
        (m) => TickState(
          status: ConsultationStatus.fromString(m['status'] as String?),
          remainingSec: ((m['remainingSec'] ?? 0) as num).toInt(),
          warnLevel: ((m['warnLevel'] ?? 0) as num).toInt(),
          walletBalance: ((m['walletBalance'] ?? 0) as num).toInt(),
          bonusBalance: ((m['bonusBalance'] ?? 0) as num).toInt(),
        ),
      );

  @override
  Future<Result<void>> pause(String consultationId, {String? reason}) => _call(
      'pauseConsultation', {'consultationId': consultationId, if (reason != null) 'reason': reason}, (_) {},);

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
    // endConsultation already succeeded server-side and returned an authoritative
    // summary. This re-read only enriches the completion screen — so if it fails
    // (a transient Firestore read error / rules edge), fall back to the summary
    // and still finish cleanly. NEVER surface a raw platform exception here: the
    // session HAS ended, and a scary error that also strands the user is worse
    // than a slightly leaner summary.
    try {
      final doc = await _db.collection('consultations').doc(id).get();
      return Success(Consultation.fromMap(id, doc.data() ?? summary));
    } catch (_) {
      return Success(Consultation.fromMap(id, summary));
    }
  }

  @override
  Future<Result<void>> rate(String consultationId,
          {required double rating, String? review, double? behaviorRating, double? accuracyRating,}) =>
      _call('rateConsultation', {
        'consultationId': consultationId,
        'rating': rating,
        if (review != null) 'review': review,
        if (behaviorRating != null) 'behaviorRating': behaviorRating,
        if (accuracyRating != null) 'accuracyRating': accuracyRating,
      }, (_) {},);

  @override
  Stream<Consultation> watch(String consultationId) => _db
      .collection('consultations')
      .doc(consultationId)
      .snapshots()
      .where((d) => d.exists)
      .map((d) => Consultation.fromMap(d.id, d.data()!));
}
