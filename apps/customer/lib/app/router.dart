import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'providers.dart';
import '../features/splash/splash_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/otp_screen.dart';
import '../features/home/home_shell.dart';
import '../features/astrologer/astrologer_profile_screen.dart';
import '../features/wallet/recharge_screen.dart';

/// Whether onboarding has been completed (persisted locally).
final onboardingDoneProvider = StateProvider<bool>((_) => false);

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

  return GoRouter(
    initialLocation: '/splash',
    redirect: (context, state) {
      // While auth is resolving, hold on splash.
      if (auth.isLoading) return state.matchedLocation == '/splash' ? null : '/splash';

      final loggedIn = auth.valueOrNull != null;
      final onboardingDone = ref.read(onboardingDoneProvider);
      final loc = state.matchedLocation;

      final isAuthRoute = loc == '/login' || loc == '/otp';
      final isBootRoute = loc == '/splash' || loc == '/onboarding';

      if (!onboardingDone) {
        return loc == '/onboarding' ? null : '/onboarding';
      }
      if (!loggedIn) {
        return isAuthRoute ? null : '/login';
      }
      // Logged in: keep out of boot/auth routes.
      if (isAuthRoute || isBootRoute) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/onboarding', builder: (_, __) => const OnboardingScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(
        path: '/otp',
        builder: (_, s) {
          final args = s.extra as OtpArgs;
          return OtpScreen(args: args);
        },
      ),
      GoRoute(path: '/home', builder: (_, __) => const HomeShell()),
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
