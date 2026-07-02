import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:shared_flutter/shared_flutter.dart';

/// Astrologer-side data access. The astrologer document is the astrologer's own
/// profile; consultations are the sessions where they are the astrologerId.
class AstrologerRepository {
  AstrologerRepository(this._db);
  final FirebaseFirestore _db;

  DocumentReference<Map<String, dynamic>> _self(String uid) => _db.collection('astrologers').doc(uid);

  Stream<Astrologer?> watchSelf(String uid) => _self(uid).snapshots().map(
        (d) => d.exists ? Astrologer.fromMap(d.id, d.data() ?? const {}) : null,
      );

  Future<void> setOnline(String uid, bool online) => _self(uid).set(
        {'onlineStatus': online, 'updatedAt': FieldValue.serverTimestamp()},
        SetOptions(merge: true),
      );

  Future<void> updateProfile(String uid, Map<String, dynamic> patch) => _self(uid).set(
        {...patch, 'updatedAt': FieldValue.serverTimestamp()},
        SetOptions(merge: true),
      );

  /// Incoming/active sessions for this astrologer (waiting = new requests).
  Stream<List<Consultation>> watchSessions(String uid, {List<String>? statuses}) {
    Query<Map<String, dynamic>> q =
        _db.collection('consultations').where('astrologerId', isEqualTo: uid);
    if (statuses != null) q = q.where('status', whereIn: statuses);
    return q.orderBy('createdAt', descending: true).limit(50).snapshots().map(
          (s) => s.docs.map((d) => Consultation.fromMap(d.id, d.data())).toList(),
        );
  }
}

/// Astrologer-side consultation actions over Cloud Functions.
class AstrologerConsultationService {
  AstrologerConsultationService(this._fn, this._db);
  final FirebaseFunctions _fn;
  final FirebaseFirestore _db;

  Future<Result<void>> _call(String name, Map<String, dynamic> data) async {
    try {
      await _fn.httpsCallable(name).call<Map<String, dynamic>>(data);
      return const Success(null);
    } on FirebaseFunctionsException catch (e) {
      return ResultFailure(Failure(message: e.message ?? 'Request failed', code: e.code));
    } catch (e) {
      return ResultFailure(Failure.unknown(e));
    }
  }

  Future<Result<void>> accept(String consultationId) =>
      _call('activateConsultation', {'consultationId': consultationId});
  Future<Result<void>> end(String consultationId) =>
      _call('endConsultation', {'consultationId': consultationId});
  Future<Result<void>> tick(String consultationId) =>
      _call('tickConsultation', {'consultationId': consultationId});

  /// Decline = cancel the waiting session and free availability. Modeled as an
  /// end call on a waiting session (the function marks it terminal).
  Future<Result<void>> decline(String consultationId) =>
      _call('endConsultation', {'consultationId': consultationId});

  Stream<Consultation> watch(String consultationId) => _db
      .collection('consultations')
      .doc(consultationId)
      .snapshots()
      .where((d) => d.exists)
      .map((d) => Consultation.fromMap(d.id, d.data()!));
}
