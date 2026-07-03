import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'providers.dart';
import '../features/splash/splash_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/otp_screen.dart';
import '../features/home/home_gate.dart';
import '../features/profile_setup/profile_setup_screen.dart';
import '../features/astrologer/astrologer_profile_screen.dart';
import '../features/wallet/recharge_screen.dart';

/// Whether onboarding has been completed (persisted locally).
final onboardingDoneProvider = StateProvider<bool>((_) => false);

/// Whether the first-run profile setup wizard has been completed (persisted
/// locally). Setup now runs BEFORE login: splash -> setup -> login -> home.
final setupDoneProvider = StateProvider<bool>((_) => false);

Future<bool> readSetupDone() async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getBool('setup_done') ?? false;
}

Future<void> setSetupDone() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setBool('setup_done', true);
}

/// Holds the router on the splash long enough for the launch animation to play.
final splashGateProvider = FutureProvider<void>((ref) async {
  await Future<void>.delayed(const Duration(milliseconds: 2500));
});

Future<bool> readOnboardingDone() async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getBool('onboarding_done') ?? false;
}

Future<void> setOnboardingDone() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setBool('onboarding_done', true);
}

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authStateProvider);
  final splashReady = ref.watch(splashGateProvider).hasValue;
  final setupDone = ref.watch(setupDoneProvider);

  return GoRouter(
    initialLocation: '/splash',
    redirect: (context, state) {
      // Hold on splash while auth resolves and the launch animation plays.
      if (auth.isLoading || !splashReady) {
        return state.matchedLocation == '/splash' ? null : '/splash';
      }

      final loggedIn = auth.valueOrNull != null;
      final loc = state.matchedLocation;
      final isAuthRoute = loc == '/login' || loc == '/otp';

      // Flow order: splash -> profile setup -> login -> home.
      if (!setupDone) {
        return loc == '/setup' ? null : '/setup';
      }
      if (!loggedIn) {
        return isAuthRoute ? null : '/login';
      }
      // Setup done + logged in: keep out of setup/boot/auth routes.
      if (loc == '/setup' || loc == '/splash' || isAuthRoute) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/setup', builder: (_, __) => const ProfileSetupScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(
        path: '/otp',
        builder: (_, s) {
          final args = s.extra as OtpArgs;
          return OtpScreen(args: args);
        },
      ),
      GoRoute(path: '/home', builder: (_, __) => const HomeGate()),
      GoRoute(
        path: '/astrologer/:id',
        builder: (_, s) => AstrologerProfileScreen(astrologerId: s.pathParameters['id']!),
      ),
      GoRoute(path: '/recharge', builder: (_, __) => const RechargeScreen()),
    ],
    errorBuilder: (_, __) => const Scaffold(
      body: Center(child: Text('Page not found')),
    ),
  );
});
