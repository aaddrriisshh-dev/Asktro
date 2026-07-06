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
  await FirebaseAppCheck.instance.activate(
    androidProvider: kDebugMode ? AndroidProvider.debug : AndroidProvider.playIntegrity,
    appleProvider: kDebugMode ? AppleProvider.debug : AppleProvider.appAttest,
  );

  // Route Flutter + async errors to Crashlytics (Part 7).
  FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
  PlatformDispatcher.instance.onError = (error, stack) {
    FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    return true;
  };

  final onboardingDone = await readOnboardingDone();
  final setupDone = await readSetupDone();

  runApp(
    ProviderScope(
      overrides: [
        onboardingDoneProvider.overrideWith((_) => onboardingDone),
        setupDoneProvider.overrideWith((_) => setupDone),
      ],
      child: const AsktroCustomerApp(),
    ),
  );
}
