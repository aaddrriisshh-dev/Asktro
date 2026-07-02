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

/// Registers this device's FCM token so the astrologer receives consultation
/// requests and payout/rating alerts (Part 5/7). Watch from the dashboard.
final pushRegistrationProvider = Provider<void>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return;
  final repo = ref.watch(astrologerRepositoryProvider);
  FirebaseMessaging.instance.requestPermission().then((_) async {
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) await repo.registerFcmToken(uid, token);
  });
  FirebaseMessaging.instance.onTokenRefresh.listen((t) => repo.registerFcmToken(uid, t));
});
