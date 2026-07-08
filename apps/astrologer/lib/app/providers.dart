import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../data/astrologer_repository.dart';

final firebaseAuthProvider = Provider<FirebaseAuth>((_) => FirebaseAuth.instance);
final firestoreProvider = Provider<FirebaseFirestore>((_) => FirebaseFirestore.instance);
final functionsProvider =
    Provider<FirebaseFunctions>((_) => FirebaseFunctions.instanceFor(region: 'asia-south1'));

final authStateProvider = StreamProvider<User?>((ref) => ref.watch(firebaseAuthProvider).authStateChanges());
final currentUidProvider = Provider<String?>((ref) => ref.watch(authStateProvider).valueOrNull?.uid);

final astrologerRepositoryProvider =
    Provider<AstrologerRepository>((ref) => AstrologerRepository(ref.watch(firestoreProvider)));

final consultationServiceProvider = Provider<AstrologerConsultationService>(
  (ref) => AstrologerConsultationService(ref.watch(functionsProvider), ref.watch(firestoreProvider)),
);

/// The signed-in astrologer's own profile (drives approval gating + dashboard).
final selfProvider = StreamProvider<Astrologer?>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref.watch(astrologerRepositoryProvider).watchSelf(uid);
});

/// A customer's public profile (name, photo, gender, birth details) by id.
final customerProvider = StreamProvider.autoDispose.family<UserProfile?, String>((ref, customerId) {
  if (customerId.isEmpty) return const Stream.empty();
  return ref.watch(astrologerRepositoryProvider).watchCustomer(customerId);
});

/// This astrologer's notifications (new requests, payouts, reviews, alerts).
final notificationsProvider = StreamProvider.autoDispose<List<Map<String, dynamic>>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref.watch(astrologerRepositoryProvider).watchNotifications(uid);
});

/// This astrologer's payout requests (wallet transaction history).
final payoutsProvider = StreamProvider.autoDispose<List<Map<String, dynamic>>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref.watch(astrologerRepositoryProvider).watchPayouts(uid);
});

/// All of this astrologer's recent sessions (any status), each with its created
/// time — the source for the Consultations tabs and the dashboard aggregates.
final sessionRowsProvider = StreamProvider.autoDispose<List<SessionRow>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref.watch(astrologerRepositoryProvider).watchSessionRows(uid);
});

/// The selected bottom-nav tab (0 Home · 1 Consults · 2 Wallet · 3 Alerts ·
/// 4 Profile). A provider so any screen — e.g. the dashboard Quick Actions —
/// can jump tabs without threading callbacks through the tree.
final dashTabProvider = StateProvider<int>((_) => 0);

/// Registers this device's FCM token so the astrologer receives consultation
/// requests and payout/rating alerts (Part 5/7). Watch from the dashboard.
final pushRegistrationProvider = Provider<void>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return;
  final repo = ref.watch(astrologerRepositoryProvider);
  FirebaseMessaging.instance.requestPermission().then((_) async {
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) await repo.registerFcmToken(uid, token);
    // Subscribe to the astrologers topic for mass broadcasts (single topic
    // message server-side instead of a per-astrologer fan-out).
    try {
      await FirebaseMessaging.instance.subscribeToTopic('astrologers');
    } catch (_) {/* non-fatal */}
  });
  FirebaseMessaging.instance.onTokenRefresh.listen((t) => repo.registerFcmToken(uid, t));
});
