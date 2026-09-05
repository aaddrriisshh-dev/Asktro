import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'app/router.dart';
import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

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
  const disableAppCheck = bool.fromEnvironment('DISABLE_APPCHECK');
  if (!disableAppCheck) {
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

  // Route Flutter + async errors to Crashlytics (Part 7). A RenderFlex/render
  // overflow is a layout warning, not a crash — record it NON-fatal so a stray
  // few-pixel overflow never counts against crash-free users; else fatal.
  FlutterError.onError = (FlutterErrorDetails details) {
    final isOverflow = details.exception.toString().contains('overflowed');
    FirebaseCrashlytics.instance.recordFlutterError(details, fatal: !isOverflow);
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
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
