import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'app/router.dart';
import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Wrap the whole startup: if Firebase init (e.g. broken/outdated Play Services
  // on some devices) or the local-storage read fails, the app would otherwise die
  // on a frozen splash AND go unreported (crash handlers aren't installed yet).
  // Instead we catch it, try to report it, and show a "tap to retry" screen.
  try {
    await _startup();
  } catch (e, st) {
    try {
      FirebaseCrashlytics.instance.recordError(e, st, reason: 'startup failed', fatal: true);
    } catch (_) {/* Firebase never came up — can't report; still show retry below */}
    runApp(const _StartupErrorApp(onRetry: main));
  }
}

Future<void> _startup() async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  // TEST-ONLY (safe): route every Firebase service to the LOCAL emulator suite
  // when launched with --dart-define=USE_EMULATOR=true. Defaults OFF, so a
  // normal/production build (which never passes this flag) is completely
  // unaffected and always talks to live Firebase. EMULATOR_HOST defaults to
  // 10.0.2.2 (the host machine as seen from an Android emulator); pass
  // --dart-define=EMULATOR_HOST=<your-Mac-LAN-IP> to test on a physical phone.
  const useEmulator = bool.fromEnvironment('USE_EMULATOR');
  const emulatorHost = String.fromEnvironment('EMULATOR_HOST', defaultValue: '10.0.2.2');
  if (useEmulator) {
    FirebaseAuth.instance.useAuthEmulator(emulatorHost, 9099);
    FirebaseFirestore.instance.useFirestoreEmulator(emulatorHost, 8080);
    FirebaseFunctions.instanceFor(region: 'asia-south1').useFunctionsEmulator(emulatorHost, 5001);
    await FirebaseStorage.instance.useStorageEmulator(emulatorHost, 9199);
  }

  // App Check. Cloud Functions callables fetch an App Check token alongside the
  // auth token; without a registered provider that second task fails on Android
  // ("1 out of 2 underlying tasks failed"), taking every callable down. Debug
  // provider on debug builds (register the printed token in the Firebase
  // console), Play Integrity / App Attest for release.
  // App Check activation must NEVER hard-crash OR hang startup. On a release
  // build NOT distributed through Play (a local sideload / friend test APK), the
  // Play Integrity provider can't attest, and — worse than throwing — its token
  // fetch can HANG, which makes the firebase SDKs hold the first data read and
  // freezes the app on the splash. So: (1) skip activation entirely for test
  // builds via --dart-define=DISABLE_APPCHECK=true, and (2) never `await` the
  // activation on release — fire-and-forget so a slow/failed provider can't block
  // launch. (App Check is not enforced server-side yet, so unactivated calls
  // still succeed; enforcement is a launch-time step once real clients ship.)
  // Skip App Check entirely in emulator mode (no attestation against a local
  // backend, and the emulator doesn't enforce it).
  const disableAppCheck = bool.fromEnvironment('DISABLE_APPCHECK');
  if (!disableAppCheck && !useEmulator) {
    final activation = FirebaseAppCheck.instance.activate(
      androidProvider: kDebugMode ? AndroidProvider.debug : AndroidProvider.playIntegrity,
      appleProvider: kDebugMode ? AppleProvider.debug : AppleProvider.appAttest,
    );
    if (kDebugMode) {
      // In debug we can await (fast, debug provider); surface failures.
      try { await activation; } catch (_) {/* non-fatal */}
    } else {
      // Release: do NOT block startup on the provider.
      activation.catchError((Object e, StackTrace st) {
        FirebaseCrashlytics.instance.recordError(e, st, reason: 'App Check activate failed');
      });
    }
  }

  // Route Flutter + async errors to Crashlytics (Part 7). Some conditions are
  // recoverable on real devices and must NOT count as crashes against crash-free
  // users (the app keeps running through them). We still record them so trends
  // stay visible, just non-fatal:
  //  - a RenderFlex/render overflow (a layout warning, not a crash);
  //  - a Google-Fonts runtime fetch that failed on a weak network — the app
  //    falls back to the system font and carries on (bundle the fonts to remove
  //    this entirely, see docs);
  //  - a cached-image file the OS reclaimed from the cache dir — the image just
  //    doesn't render.
  bool isNonFatal(String msg) =>
      msg.contains('overflowed') ||
      msg.contains('Failed to load font') ||
      (msg.contains('PathNotFoundException') &&
          (msg.contains('CachedImageData') || msg.contains('libCachedImageData')));
  FlutterError.onError = (FlutterErrorDetails details) {
    FirebaseCrashlytics.instance
        .recordFlutterError(details, fatal: !isNonFatal(details.exception.toString()));
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    FirebaseCrashlytics.instance.recordError(error, stack, fatal: !isNonFatal(error.toString()));
    return true;
  };

  final onboardingDone = await readOnboardingDone();

  runApp(
    ProviderScope(
      overrides: [
        onboardingDoneProvider.overrideWith((_) => onboardingDone),
      ],
      child: const AsktroCustomerApp(),
    ),
  );
}

/// Shown only when startup itself failed (before the app could draw). A calm
/// "couldn't start — retry" screen instead of a frozen splash; Retry re-runs the
/// whole startup (e.g. once the network settles or Play Services updates).
class _StartupErrorApp extends StatelessWidget {
  const _StartupErrorApp({required this.onRetry});
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: const Color(0xFFF5F2FF),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.refresh_rounded, size: 48, color: Color(0xFF6A47C7)),
                const SizedBox(height: 16),
                const Text("Couldn't start", style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                const Text('Please check your internet connection and try again.', textAlign: TextAlign.center),
                const SizedBox(height: 20),
                FilledButton(onPressed: onRetry, child: const Text('Retry')),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
