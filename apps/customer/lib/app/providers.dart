import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/consultation_service_impl.dart';
import '../data/wallet_service_impl.dart';
import '../data/rtc_token_service_impl.dart';
import '../data/repositories.dart';
import '../data/messaging_service.dart';
import 'package:shared_flutter/shared_flutter.dart';

/// Dependency injection via Riverpod. Firebase singletons are provided so they
/// can be overridden with fakes in widget/integration tests.

final firebaseAuthProvider = Provider<FirebaseAuth>((_) => FirebaseAuth.instance);
final firestoreProvider = Provider<FirebaseFirestore>((_) => FirebaseFirestore.instance);
final functionsProvider =
    Provider<FirebaseFunctions>((_) => FirebaseFunctions.instanceFor(region: 'asia-south1'));

/// Current auth state (drives the router redirect).
final authStateProvider = StreamProvider<User?>((ref) {
  return ref.watch(firebaseAuthProvider).authStateChanges();
});

final currentUidProvider = Provider<String?>((ref) {
  return ref.watch(authStateProvider).valueOrNull?.uid;
});

// ---- Repositories ----
final astrologerRepositoryProvider = Provider<AstrologerRepository>(
  (ref) => AstrologerRepository(ref.watch(firestoreProvider)),
);
final userRepositoryProvider = Provider<UserRepository>(
  (ref) => UserRepository(ref.watch(firestoreProvider)),
);
final catalogRepositoryProvider = Provider<CatalogRepository>(
  (ref) => CatalogRepository(ref.watch(firestoreProvider)),
);
final walletRepositoryProvider = Provider<WalletRepository>(
  (ref) => WalletRepository(ref.watch(firestoreProvider)),
);
final notificationRepositoryProvider = Provider<NotificationRepository>(
  (ref) => NotificationRepository(ref.watch(firestoreProvider)),
);

// ---- Services (RPC over Cloud Functions) ----
final consultationServiceProvider = Provider<ConsultationService>(
  (ref) => ConsultationServiceImpl(
    ref.watch(functionsProvider),
    ref.watch(firestoreProvider),
  ),
);
final walletServiceProvider = Provider<WalletService>(
  (ref) => WalletServiceImpl(ref.watch(functionsProvider)),
);
final rtcTokenServiceProvider = Provider<RtcTokenService>(
  (ref) => RtcTokenServiceImpl(ref.watch(functionsProvider)),
);

// ---- Cross-cutting: analytics + messaging ----
final analyticsProvider = Provider<AnalyticsService>(
  (_) => FirebaseAnalyticsService(FirebaseAnalytics.instance),
);
final messagingServiceProvider = Provider<MessagingService>(
  (ref) => MessagingService(FirebaseMessaging.instance, ref.watch(userRepositoryProvider)),
);

// ---- Current user's profile (realtime) ----
final myProfileProvider = StreamProvider<UserProfile?>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref.watch(userRepositoryProvider).watchProfile(uid);
});

/// Registers this device's FCM token whenever a user is signed in, and sets the
/// analytics user id. Watch this from the app shell to activate it.
final pushRegistrationProvider = Provider<void>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return;
  ref.watch(analyticsProvider).setUserId(uid);
  ref.watch(messagingServiceProvider).registerFor(uid);
});
