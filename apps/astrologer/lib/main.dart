import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  // App Check — the project enforces it (see customer app). Phone-auth
  // verification and Cloud Functions callables both fetch an App Check token;
  // without a registered provider they fail on Android (the "missing app
  // identifier / Play Integrity" error). Debug provider on debug builds
  // (register the printed token in the Firebase console), Play Integrity /
  // App Attest for release.
  // App Check activation must NEVER hard-crash startup. On a release build that
  // wasn't distributed through Play (e.g. a local sideload), the Play Integrity
  // provider can throw — without this guard that exception hangs the app at the
  // splash. Wrapped so the app still launches; callables/phone-auth simply fetch
  // no App Check token until the provider is fully provisioned.
  try {
    await FirebaseAppCheck.instance.activate(
      androidProvider: kDebugMode ? AndroidProvider.debug : AndroidProvider.playIntegrity,
      appleProvider: kDebugMode ? AppleProvider.debug : AppleProvider.appAttest,
    );
  } catch (e, st) {
    FirebaseCrashlytics.instance.recordError(e, st, reason: 'App Check activate failed');
  }

  FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
  PlatformDispatcher.instance.onError = (error, stack) {
    FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    return true;
  };

  runApp(const ProviderScope(child: AsktroAstrologerApp()));
}
