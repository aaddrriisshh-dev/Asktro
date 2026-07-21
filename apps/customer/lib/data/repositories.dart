import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:shared_flutter/shared_flutter.dart';

/// Firestore-backed read repositories. All money/timer writes go through Cloud
/// Functions (services); these only read/observe and perform user-owned,
/// rules-permitted writes (favourites, read flags).

class AstrologerRepository {
  AstrologerRepository(this._db);
  final FirebaseFirestore _db;

  CollectionReference<Map<String, dynamic>> get _col => _db.collection('astrologers');

  Astrologer _map(DocumentSnapshot<Map<String, dynamic>> d) =>
      Astrologer.fromMap(d.id, d.data() ?? const {});

  // NOTE: these rails filter/sort client-side over a single-field query so
  // they work WITHOUT deployed composite indexes. The directory is small; once
  // firestore.indexes.json is deployed these can move back to server-side
  // where + orderBy for scale.
  bool _isActive(DocumentSnapshot<Map<String, dynamic>> d) =>
      (d.data()?['active'] ?? true) == true;

  int _createdMs(DocumentSnapshot<Map<String, dynamic>> d) {
    final ts = d.data()?['createdAt'];
    return ts is Timestamp ? ts.millisecondsSinceEpoch : 0;
  }

  Stream<List<Astrologer>> watchOnline({int limit = 20}) => _col
      .where('onlineStatus', isEqualTo: true)
      .limit(100)
      .snapshots()
      .map((s) {
        final list = s.docs.where(_isActive).map(_map).toList()
          ..sort((a, b) => b.rating.compareTo(a.rating));
        return list.take(limit).toList();
      });

  Stream<List<Astrologer>> watchFeatured({int limit = 10}) => _col
      .where('featured', isEqualTo: true)
      .limit(100)
      .snapshots()
      .map((s) {
        final list = s.docs.where(_isActive).map(_map).toList()
          ..sort((a, b) => b.rating.compareTo(a.rating));
        return list.take(limit).toList();
      });

  Stream<List<Astrologer>> watchTopRated({int limit = 12}) => _col
      .limit(100)
      .snapshots()
      .map((s) {
        // Tolerate docs missing the `active` field (seeded personas don't set
        // it) — _isActive defaults to true, so they're included.
        final list = s.docs.where(_isActive).map(_map).toList()
          ..sort((a, b) => b.rating.compareTo(a.rating));
        return list.take(limit).toList();
      });

  /// Admin-curated "Rising Stars". Shows astrologers tagged `risingStar: true`
  /// from the portal; before any are tagged, falls back to the newest joiners
  /// so the rail is never empty.
  Stream<List<Astrologer>> watchRisingStars({int limit = 12}) => _col
      .limit(100)
      .snapshots()
      .map((s) {
        final docs = s.docs.where(_isActive).toList();
        final tagged = docs
            .where((d) => (d.data()['risingStar'] ?? false) == true)
            .map(_map)
            .toList()
          ..sort((a, b) => b.rating.compareTo(a.rating));
        if (tagged.isNotEmpty) return tagged.take(limit).toList();
        docs.sort((a, b) => _createdMs(b).compareTo(_createdMs(a)));
        return docs.take(limit).map(_map).toList();
      });

  Stream<List<Astrologer>> watchNewest({int limit = 10}) => _col
      .where('active', isEqualTo: true)
      .limit(100)
      .snapshots()
      .map((s) {
        final docs = s.docs.toList()
          ..sort((a, b) => _createdMs(b).compareTo(_createdMs(a)));
        return docs.take(limit).map(_map).toList();
      });

  Stream<Astrologer> watchOne(String id) =>
      _col.doc(id).snapshots().map(_map);

  /// Discovery by a controlled specialization tag (love/career/…), mixing AI +
  /// human. Filtered + sorted client-side (online/consultable first, then rating)
  /// for the same reason as the rails above — no composite index required. The
  /// tag lives in the `specializations` array on the astrologer doc.
  Stream<List<Astrologer>> watchBySpecialization(String spec, {int limit = 100}) => _col
      .where('specializations', arrayContains: spec)
      .limit(limit)
      .snapshots()
      .map((s) {
        final list = s.docs.where(_isActive).map(_map).toList()
          ..sort((a, b) {
            // Consultable (online AI/human) first, then by rating.
            if (a.isConsultable != b.isConsultable) return a.isConsultable ? -1 : 1;
            return b.rating.compareTo(a.rating);
          });
        return list;
      });

  /// Client-side name/expertise search over the active directory. For large
  /// scale this would be backed by a search index; kept simple and correct here.
  Future<List<Astrologer>> search(String query, {bool risingOnly = false}) async {
    final q = query.trim().toLowerCase();
    // No Firestore `active` filter: seeded personas don't set the field, and a
    // where-clause on a missing field silently drops them. Filter tolerantly
    // client-side (default active) so the full directory shows.
    final snap = await _col.limit(500).get();
    var all = snap.docs.where(_isActive).map(_map).toList()
      ..sort((a, b) => b.rating.compareTo(a.rating));
    if (risingOnly) all = all.where((a) => a.risingStar).toList();
    if (q.isEmpty) return all;
    return all
        .where((a) =>
            a.name.toLowerCase().contains(q) ||
            a.expertise.any((e) => e.toLowerCase().contains(q)) ||
            a.languages.any((l) => l.toLowerCase().contains(q)),)
        .toList();
  }
}

class UserRepository {
  UserRepository(this._db);
  final FirebaseFirestore _db;

  DocumentReference<Map<String, dynamic>> _doc(String uid) => _db.collection('users').doc(uid);

  Stream<UserProfile?> watchProfile(String uid) => _doc(uid).snapshots().map(
        (d) => d.exists ? UserProfile.fromMap(d.id, d.data() ?? const {}) : null,
      );

  /// Create the profile doc exactly once, in a SINGLE write that also includes
  /// the onboarding details collected before login ([profile]: name, gender,
  /// birth details, languages). Doing it in one create avoids the old race where
  /// a separate "flush" write competed with this one and could wipe the name to
  /// 'Guest' or be denied by the create rule. Money fields MUST start at zero
  /// (enforced by security rules); onCustomerSignup backfills the referral code.
  Future<void> ensureProfile(
    String uid, {
    required String phone,
    String? name,
    String? email,
    Map<String, dynamic>? profile,
  }) async {
    final ref = _doc(uid);
    final snap = await ref.get();
    final resolvedName = (name ?? profile?['name'] as String?)?.trim();
    if (snap.exists) {
      // The doc already exists — e.g. the server-side onAuthUserCreate trigger
      // won the race and created a bare {name:'Guest'} profile. We must NOT skip:
      // that would silently lose the birth details the user just entered. Merge
      // the onboarding fields into the existing doc instead. NEVER touch the
      // money/status/referral fields (function-owned; the client-update rule
      // rejects them and merging 0 could wipe a live balance), and never clobber
      // a real name with an empty one.
      const reserved = {
        'walletBalance', 'bonusBalance', 'chatBonusBalance', 'lockedBalance',
        'totalRecharge', 'totalSpent', 'pendingRefund', 'totalConsultations',
        'referralCode', 'referredBy', 'accountStatus', 'signupBonusGranted',
        'firstRechargeAt', 'chatGraceUsed',
      };
      final merge = <String, dynamic>{
        for (final e in (profile ?? const {}).entries)
          if (!reserved.contains(e.key)) e.key: e.value,
        if (resolvedName != null && resolvedName.isNotEmpty) 'name': resolvedName,
        if (email != null && email.isNotEmpty) 'email': email,
        'updatedAt': FieldValue.serverTimestamp(),
      };
      // Only write when there's real onboarding content to merge (more than the
      // always-present updatedAt).
      if (merge.length > 1) await ref.set(merge, SetOptions(merge: true));
      return;
    }
    await ref.set({
      ...?profile, // birth details, gender, languages, onboardingComplete, etc.
      'name': (resolvedName != null && resolvedName.isNotEmpty) ? resolvedName : 'Guest',
      'phone': phone,
      if (email != null && email.isNotEmpty) 'email': email,
      'walletBalance': 0,
      'bonusBalance': 0,
      'lockedBalance': 0,
      'notificationEnabled': true,
      'accountStatus': 'active',
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> updateProfile(String uid, Map<String, dynamic> patch) =>
      _doc(uid).set({...patch, 'updatedAt': FieldValue.serverTimestamp()}, SetOptions(merge: true));

  Future<void> toggleFavourite(String uid, String astrologerId, bool fav) => _doc(uid).update({
        'favouriteAstrologers':
            fav ? FieldValue.arrayUnion([astrologerId]) : FieldValue.arrayRemove([astrologerId]),
      });

  Future<void> registerFcmToken(String uid, String token) =>
      _doc(uid).set({'fcmTokens': FieldValue.arrayUnion([token])}, SetOptions(merge: true));
}

class CatalogRepository {
  CatalogRepository(this._db);
  final FirebaseFirestore _db;

  // Client-side sort so this works without the composite index deployed.
  Stream<List<RechargePlan>> watchPlans() => _db
      .collection('rechargePlans')
      .where('active', isEqualTo: true)
      .limit(50)
      .snapshots()
      .map((s) {
        final list = s.docs.map((d) => RechargePlan.fromMap(d.id, d.data())).toList()
          ..sort((a, b) => a.displayOrder.compareTo(b.displayOrder));
        return list;
      });

  // Equality-only query (no orderBy) so banners written by the admin portal —
  // which don't set a `priority` field — are never excluded, and no composite
  // index is required. Sorted client-side: priority desc, then newest first.
  Stream<List<PromoBanner>> watchBanners(String placement) => _db
      .collection('banners')
      .where('active', isEqualTo: true)
      .where('placement', isEqualTo: placement)
      .snapshots()
      .map((s) {
        final list = s.docs.map((d) {
          final ts = d.data()['createdAt'];
          return PromoBanner.fromMap(d.id, d.data(),
              createdAtMs: ts is Timestamp ? ts.millisecondsSinceEpoch : 0,);
        }).toList()
          ..sort((a, b) {
            if (a.priority != b.priority) return b.priority.compareTo(a.priority);
            return b.createdAtMs.compareTo(a.createdAtMs);
          });
        return list;
      });

  // Active, unexpired coupons for the Offers screen. Equality-only query (no
  // orderBy / composite index); expiry + sort handled client-side. Audience is
  // enforced authoritatively at redemption, but hidden here for a cleaner list.
  Stream<List<Coupon>> watchCoupons() => _db
      .collection('coupons')
      .where('active', isEqualTo: true)
      .limit(50)
      .snapshots()
      .map((s) => _mapCoupons(s.docs));

  // One-shot fetch that prefers the SERVER over the local cache. The app-open
  // popup uses this so it never surfaces a stale/deleted coupon that Firestore's
  // offline cache still holds — a live-stream's first emission is cache-first.
  Future<List<Coupon>> fetchActiveCoupons() async {
    final snap = await _db
        .collection('coupons')
        .where('active', isEqualTo: true)
        .limit(50)
        .get(const GetOptions(source: Source.server));
    return _mapCoupons(snap.docs);
  }

  List<Coupon> _mapCoupons(List<QueryDocumentSnapshot<Map<String, dynamic>>> docs) =>
      docs.map((d) {
        final data = d.data();
        final exp = data['expiry'];
        final created = data['createdAt'];
        return Coupon.fromMap(
          d.id,
          data,
          expiryMs: exp is Timestamp ? exp.millisecondsSinceEpoch : null,
          createdAtMs: created is Timestamp ? created.millisecondsSinceEpoch : 0,
        );
      }).where((c) => !c.isExpired).toList()
        ..sort((a, b) => b.createdAtMs.compareTo(a.createdAtMs));
}

class WalletRepository {
  WalletRepository(this._db);
  final FirebaseFirestore _db;

  Stream<List<WalletTransaction>> watchTransactions(String uid, {int limit = 50}) => _db
      .collection('walletTransactions')
      .where('userId', isEqualTo: uid)
      .orderBy('createdAt', descending: true)
      .limit(limit)
      .snapshots()
      .map((s) => s.docs.map((d) {
            final ts = d.data()['createdAt'];
            return WalletTransaction.fromMap(
              d.id,
              d.data(),
              createdAtMs: ts is Timestamp ? ts.millisecondsSinceEpoch : null,
            );
          }).toList(),);
}

class NotificationRepository {
  NotificationRepository(this._db);
  final FirebaseFirestore _db;

  Stream<List<AppNotification>> watch(String uid, {int limit = 50}) => _db
      .collection('notifications')
      .where('userId', isEqualTo: uid)
      .orderBy('createdAt', descending: true)
      .limit(limit)
      .snapshots()
      .map((s) => s.docs.map((d) {
            final ts = d.data()['createdAt'];
            return AppNotification.fromMap(
              d.id,
              d.data(),
              createdAtMs: ts is Timestamp ? ts.millisecondsSinceEpoch : null,
            );
          }).toList(),);

  Future<void> markRead(String id) =>
      _db.collection('notifications').doc(id).update({'read': true});

  // Bounded to 20 so a user with thousands of unread notifications doesn't
  // stream them all just to render a badge (which caps at "9+" anyway). This
  // listener is mounted on the home shell for the whole session.
  Stream<int> unreadCount(String uid) => _db
      .collection('notifications')
      .where('userId', isEqualTo: uid)
      .where('read', isEqualTo: false)
      .limit(20)
      .snapshots()
      .map((s) => s.docs.length);
}
