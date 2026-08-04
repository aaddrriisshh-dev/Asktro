import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart' hide Result;
import 'package:shared_flutter/shared_flutter.dart';

/// Astrologer-side data access. The astrologer document is the astrologer's own
/// profile; consultations are the sessions where they are the astrologerId.
class AstrologerRepository {
  AstrologerRepository(this._db);
  final FirebaseFirestore _db;

  DocumentReference<Map<String, dynamic>> _self(String uid) => _db.collection('astrologers').doc(uid);

  /// The astrologer's own profile. Money fields (earnings, pendingPayout,
  /// commissionPercent) no longer live on the public directory doc — they're in
  /// `astrologers/{uid}/private/financials`, readable only by this astrologer
  /// and admins. We merge that private doc over the public one so the astrologer
  /// still sees their own money, while customers/competitors never can.
  Stream<Astrologer?> watchSelf(String uid) => _combineSelf(
        uid,
        _self(uid).snapshots(),
        _self(uid).collection('private').doc('financials').snapshots(),
      );

  Stream<Astrologer?> _combineSelf(
    String uid,
    Stream<DocumentSnapshot<Map<String, dynamic>>> main,
    Stream<DocumentSnapshot<Map<String, dynamic>>> fin,
  ) {
    final controller = StreamController<Astrologer?>();
    Map<String, dynamic>? mainData;
    var mainExists = false;
    var mainReady = false;
    Map<String, dynamic> finData = const {};
    var finReady = false;
    StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? s1, s2;

    num asNum(dynamic v) => v is num ? v : 0;

    void emit() {
      if (!mainReady || !finReady) return; // wait for both first events
      if (!mainExists) {
        controller.add(null);
        return;
      }
      final merged = <String, dynamic>{...?mainData, ...finData};
      // During the migration window money can briefly sit on BOTH the public doc
      // (pre-backfill) and private/financials (new accruals). SUM the additive
      // fields so the astrologer's earnings never dips; after the backfill the
      // public doc no longer carries them, so this equals financials alone.
      final Map<String, dynamic> m = mainData ?? const <String, dynamic>{};
      if (m.containsKey('earnings') || finData.containsKey('earnings')) {
        merged['earnings'] = asNum(m['earnings']) + asNum(finData['earnings']);
      }
      if (m.containsKey('pendingPayout') || finData.containsKey('pendingPayout')) {
        merged['pendingPayout'] = asNum(m['pendingPayout']) + asNum(finData['pendingPayout']);
      }
      controller.add(Astrologer.fromMap(uid, merged));
    }

    s1 = main.listen((d) {
      mainExists = d.exists;
      mainData = d.data();
      mainReady = true;
      emit();
    }, onError: controller.addError,);

    s2 = fin.listen((d) {
      finData = d.data() ?? const {};
      finReady = true;
      emit();
    }, onError: (_) {
      // financials is optional (may not exist yet) — proceed without it.
      finReady = true;
      emit();
    },);

    controller.onCancel = () async {
      await s1?.cancel();
      await s2?.cancel();
    };
    return controller.stream;
  }

  Future<void> setOnline(String uid, bool online) => _self(uid).set(
        {'onlineStatus': online, 'updatedAt': FieldValue.serverTimestamp()},
        SetOptions(merge: true),
      );

  /// Presence heartbeat — written to a SEPARATE presence doc (not the public
  /// directory doc) while the astrologer is online, so a sweep can force a
  /// crashed/dropped app offline without the frequent write churning the doc
  /// customers watch.
  Future<void> heartbeat(String uid) => _db.collection('presence').doc(uid).set(
        {'lastSeen': FieldValue.serverTimestamp()},
        SetOptions(merge: true),
      );

  Future<void> updateProfile(String uid, Map<String, dynamic> patch) => _self(uid).set(
        {...patch, 'updatedAt': FieldValue.serverTimestamp()},
        SetOptions(merge: true),
      );

  Future<void> registerFcmToken(String uid, String token) => _self(uid).set(
        {'fcmTokens': FieldValue.arrayUnion([token])},
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

  /// Every recent session with its created time preserved — powers the
  /// dashboard's today-aggregates and the Consultations tabs. (The shared
  /// Consultation model doesn't carry createdAt, so we keep it alongside.)
  Stream<List<SessionRow>> watchSessionRows(String uid) => _db
      .collection('consultations')
      .where('astrologerId', isEqualTo: uid)
      .limit(200)
      .snapshots()
      .map((s) {
        // No orderBy — a single-field equality needs no composite index. Sort
        // newest-first on the device instead.
        final rows = s.docs.map((d) {
          final data = d.data();
          final ca = data['createdAt'];
          final ms = ca is Timestamp ? ca.millisecondsSinceEpoch : null;
          return SessionRow(Consultation.fromMap(d.id, data), ms);
        }).toList();
        rows.sort((a, b) => (b.createdAtMs ?? 0).compareTo(a.createdAtMs ?? 0));
        return rows;
      });

  /// The customer's public profile (name, photo, gender, birth details, etc.).
  /// The astrologer never sees wallet/money fields — only what helps them read
  /// the chart and personalise the consultation.
  /// Reads the customer's SAFE profile card (name, photo, birth details only) —
  /// never their phone/email/money. This mirror doc is written by the backend
  /// when a consultation is created, and astrologers have NO read access to the
  /// real `users` collection (enforced in firestore.rules), so a customer's
  /// phone number can never reach an astrologer.
  Stream<UserProfile?> watchCustomer(String customerId) => _db
      .collection('customerProfiles')
      .doc(customerId)
      .snapshots()
      .map((d) => d.exists ? UserProfile.fromMap(d.id, d.data() ?? const {}) : null);

  /// Every prior session between this astrologer and this customer (for the
  /// "previous consultations" timeline on the details screen).
  Stream<List<Consultation>> watchHistoryWith(String astrologerId, String customerId) => _db
      .collection('consultations')
      .where('astrologerId', isEqualTo: astrologerId)
      .where('customerId', isEqualTo: customerId)
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .map((s) => s.docs.map((d) => Consultation.fromMap(d.id, d.data())).toList());

  DocumentReference<Map<String, dynamic>> _noteRef(String astrologerId, String customerId) =>
      _db.collection('astrologers').doc(astrologerId).collection('notes').doc(customerId);

  /// Private note the astrologer keeps on a customer (never visible to the
  /// customer). Stored under the astrologer's own document.
  Stream<String> watchPrivateNote(String astrologerId, String customerId) =>
      _noteRef(astrologerId, customerId).snapshots().map((d) => (d.data()?['text'] ?? '') as String);

  Future<void> savePrivateNote(String astrologerId, String customerId, String text) => _noteRef(
        astrologerId,
        customerId,
      ).set({'text': text, 'updatedAt': FieldValue.serverTimestamp()}, SetOptions(merge: true));

  /// Astrologer-facing notifications (payouts, reviews, announcements).
  Stream<List<Map<String, dynamic>>> watchNotifications(String uid) => _db
      .collection('notifications')
      .where('userId', isEqualTo: uid)
      .orderBy('createdAt', descending: true)
      .limit(80)
      .snapshots()
      .map((s) => s.docs.map((d) => {'id': d.id, ...d.data()}).toList());

  /// Payout requests raised by this astrologer (wallet transaction history).
  Stream<List<Map<String, dynamic>>> watchPayouts(String uid) => _db
      .collection('payouts')
      .where('astrologerId', isEqualTo: uid)
      .limit(50)
      .snapshots()
      .map((s) {
        final list = s.docs.map((d) => {'id': d.id, ...d.data()}).toList();
        list.sort((a, b) {
          final am = a['createdAt'], bm = b['createdAt'];
          final ax = am is Timestamp ? am.millisecondsSinceEpoch : 0;
          final bx = bm is Timestamp ? bm.millisecondsSinceEpoch : 0;
          return bx.compareTo(ax);
        });
        return list;
      });
}

/// A consultation paired with its Firestore createdAt (in ms), which the shared
/// Consultation model doesn't expose.
class SessionRow {
  const SessionRow(this.c, this.createdAtMs);
  final Consultation c;
  final int? createdAtMs;

  bool get isToday {
    final ms = createdAtMs;
    if (ms == null) return false;
    final now = DateTime.now();
    final start = DateTime(now.year, now.month, now.day).millisecondsSinceEpoch;
    return ms >= start;
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
