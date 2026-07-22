import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/consultation/chat_deeplink_screen.dart';
import '../data/consultation_service_impl.dart';
import '../data/wallet_service_impl.dart';
import '../data/rtc_token_service_impl.dart';
import '../data/repositories.dart';
import '../data/messaging_service.dart';
import '../data/prokerala_service.dart';
import '../data/prokerala_repository.dart';
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

/// Selected bottom-nav tab in the home shell (0=Home … 4=Profile). Exposed so
/// widgets like the home top bar can jump to another tab (e.g. Profile).
final homeTabProvider = StateProvider<int>((_) => 0);

/// Profile details collected during pre-login setup (setup now runs BEFORE
/// login). Buffered here, then written to Firestore right after sign-in.
final pendingProfileProvider = StateProvider<Map<String, dynamic>?>((_) => null);

/// The user's chosen app language code ('en','hi','mr','pa','te','kn').
/// Persisted to the profile; full UI translation is rolled out progressively.
final appLanguageProvider = StateProvider<String>((_) => 'en');

final currentUidProvider = Provider<String?>((ref) {
  return ref.watch(authStateProvider).valueOrNull?.uid;
});

// ---- ProKerala astrology (proxy client + cached repository) ----
final prokeralaServiceProvider =
    Provider<ProkeralaService>((ref) => ProkeralaService(ref.watch(functionsProvider)));
final prokeralaRepositoryProvider = Provider<ProkeralaRepository?>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return null;
  return ProkeralaRepository(
    ref.watch(prokeralaServiceProvider),
    ref.watch(firestoreProvider),
    uid,
  );
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

/// Root navigator key so background code (a tapped push) can navigate without a
/// BuildContext. Attached to the app's GoRouter.
final rootNavigatorKey = GlobalKey<NavigatorState>();

/// Set true when this launch came from tapping a notification, so the Home
/// screen's auto welcome/offer popup stands down — the user came for the
/// notification, not an ad.
final promoSuppressedProvider = StateProvider<bool>((_) => false);

/// Registers this device's FCM token whenever a user is signed in, sets the
/// analytics user id, and routes a tapped chat push straight into that chat.
final pushRegistrationProvider = Provider<void>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return;
  ref.watch(analyticsProvider).setUserId(uid);
  final messaging = ref.watch(messagingServiceProvider);
  messaging.registerFor(uid);
  messaging.wireNotificationTaps((data) {
    // Opened via a notification tap → don't ambush them with the auto-offer.
    ref.read(promoSuppressedProvider.notifier).state = true;
    final dl = (data['deeplink'] ?? '').toString();
    if (dl.startsWith('asktro://chat/')) {
      final cid = dl.substring('asktro://chat/'.length);
      if (cid.isNotEmpty) {
        rootNavigatorKey.currentState?.push(
          MaterialPageRoute<void>(builder: (_) => ChatDeepLinkScreen(consultationId: cid)),
        );
      }
    }
  });
});
