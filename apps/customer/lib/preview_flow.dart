// Flow gallery — see EVERY screen from the beginning without fighting auth.
//
// A normal `flutter run` (main.dart) sends you straight to login or home,
// because the router redirect skips the splash / onboarding / profile-setup
// once you're already signed in and the flags are set. This entry point uses
// the SAME real screens but with a router that has NO redirect, plus a menu
// so you can jump into any screen directly.
//
//   cd apps/customer
//   flutter run -t lib/preview_flow.dart
//
// Notes:
//  - Firebase is initialized (guarded) so provider-backed screens (login, home)
//    render. On a device where google-services is configured this "just works".
//  - Use the Android back gesture / arrow to return to the gallery menu.
//  - This is a preview harness only; the production entry point is main.dart.
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import 'firebase_options.dart';
import 'features/splash/splash_screen.dart';
import 'features/onboarding/onboarding_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/otp_screen.dart';
import 'features/profile_setup/profile_setup_screen.dart';
import 'features/home/home_shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Guarded: if Firebase isn't configured the pure-UI screens still render.
  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  } catch (_) {/* login/home may be limited without Firebase */}

  runApp(const ProviderScope(child: _PreviewFlowApp()));
}

final _previewRouter = GoRouter(
  initialLocation: '/gallery',
  routes: [
    GoRoute(path: '/gallery', builder: (_, __) => const _Gallery()),
    // Real screens, reachable directly — no auth/onboarding redirect.
    GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
    GoRoute(path: '/onboarding', builder: (_, __) => const OnboardingScreen()),
    GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
    GoRoute(
      path: '/otp',
      builder: (_, s) => OtpScreen(args: s.extra as OtpArgs),
    ),
    GoRoute(
      path: '/profile-setup',
      builder: (_, __) => const ProfileSetupScreen(initialName: 'Adrish'),
    ),
    GoRoute(path: '/home', builder: (_, __) => const HomeShell()),
  ],
  errorBuilder: (_, s) => Scaffold(
    appBar: AppBar(title: const Text('Preview error')),
    body: Center(child: Text('No route for ${s.uri}')),
  ),
);

class _PreviewFlowApp extends StatelessWidget {
  const _PreviewFlowApp();
  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'ASKTRO Flow Preview',
      debugShowCheckedModeBanner: false,
      theme: AsktroTheme.light(),
      routerConfig: _previewRouter,
    );
  }
}

class _Entry {
  const _Entry(this.label, this.subtitle, this.route);
  final String label;
  final String subtitle;
  final String route;
}

const _entries = <_Entry>[
  _Entry('1 · Animated Splash', 'Gold-glow launch animation + wordmark', '/splash'),
  _Entry('2 · Onboarding Intro', '3-page value carousel', '/onboarding'),
  _Entry('3 · Login', 'Phone + Google sign-in', '/login'),
  _Entry('4 · Profile Setup', '7-step first-run wizard', '/profile-setup'),
  _Entry('5 · Home', 'Main app shell (tabs)', '/home'),
];

class _Gallery extends StatelessWidget {
  const _Gallery();
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('ASKTRO — Flow Preview'),
        centerTitle: true,
      ),
      body: ListView.separated(
        padding: const EdgeInsets.all(20),
        itemCount: _entries.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) {
          final e = _entries[i];
          return Card(
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: BorderSide(color: Colors.deepPurple.shade100),
            ),
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
              title: Text(e.label,
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 17)),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(e.subtitle),
              ),
              trailing: const Icon(Icons.arrow_forward_rounded),
              onTap: () => context.push(e.route),
            ),
          );
        },
      ),
    );
  }
}
