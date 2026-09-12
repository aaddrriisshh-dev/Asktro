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
  // Wrap startup: if Firebase init or an early step fails, show a "tap to retry"
  // screen instead of a frozen splash (and report it if Firebase came up enough).
  try {
    await _startup();
  } catch (e, st) {
    try {
      FirebaseCrashlytics.instance.recordError(e, st, reason: 'startup failed', fatal: true);
    } catch (_) {/* Firebase never came up — still show retry below */}
    runApp(const _StartupErrorApp(onRetry: main));
  }
}

Future<void> _startup() async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  // App Check — the project enforces it (see customer app). Phone-auth
  // verification and Cloud Functions callables both fetch an App Check token;
  // without a registered provider they fail on Android (the "missing app
  // identifier / Play Integrity" error). Debug provider on debug builds
  // (register the printed token in the Firebase console), Play Integrity /
  // App Attest for release.
  // App Check activation must NEVER hard-crash OR hang startup. On a release
  // build not distributed through Play (a local sideload / friend test APK), the
  // Play Integrity provider can't attest, and its token fetch can HANG — which
  // holds the first data read and freezes the app on the splash. So: (1) skip it
  // for test builds via --dart-define=DISABLE_APPCHECK=true, and (2) never
  // `await` activation on release (fire-and-forget). App Check is not enforced
  // server-side yet, so unactivated calls still succeed.
  const disableAppCheck = bool.fromEnvironment('DISABLE_APPCHECK');
  if (!disableAppCheck) {
    final activation = FirebaseAppCheck.instance.activate(
      androidProvider: kDebugMode ? AndroidProvider.debug : AndroidProvider.playIntegrity,
      appleProvider: kDebugMode ? AppleProvider.debug : AppleProvider.appAttest,
    );
    if (kDebugMode) {
      try { await activation; } catch (_) {/* non-fatal */}
    } else {
      activation.catchError((Object e, StackTrace st) {
        FirebaseCrashlytics.instance.recordError(e, st, reason: 'App Check activate failed');
      });
    }
  }

  // A RenderFlex/RenderObject overflow is a layout warning, not a crash. Record
  // it (so it stays visible) but NON-fatal, so a stray few-pixel overflow never
  // counts against crash-free users. Everything else stays fatal.
  FlutterError.onError = (FlutterErrorDetails details) {
    final isOverflow = details.exception.toString().contains('overflowed');
    FirebaseCrashlytics.instance.recordFlutterError(details, fatal: !isOverflow);
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    return true;
  };

  runApp(const ProviderScope(child: AsktroAstrologerApp()));
}

/// Shown only when startup itself failed (before the app could draw) — a calm
/// "couldn't start — retry" screen instead of a frozen splash. Retry re-runs the
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
