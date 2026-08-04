import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'providers.dart';
import '../features/auth/login_screen.dart';
import '../features/dashboard/dashboard_screen.dart';
import '../features/splash/splash_screen.dart';

/// Root navigator key — lets the app-wide incoming-call gate raise the ring over
/// whatever screen the astrologer is on, without needing a Navigator in context.
final rootNavigatorKey = GlobalKey<NavigatorState>();

/// Holds the router on the splash long enough for the launch animation to play
/// (the revolving zodiac wheel + wordmark reveal) before auth routing takes over.
final splashGateProvider = FutureProvider<void>((ref) async {
  await Future<void>.delayed(const Duration(milliseconds: 4200));
});

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authStateProvider);
  final splashReady = ref.watch(splashGateProvider).hasValue;
  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/splash',
    redirect: (context, state) {
      if (auth.isLoading || !splashReady) {
        return state.matchedLocation == '/splash' ? null : '/splash';
      }
      final loggedIn = auth.valueOrNull != null;
      final loc = state.matchedLocation;
      if (!loggedIn) return loc == '/login' ? null : '/login';
      if (loc == '/login' || loc == '/splash') return '/dashboard';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/dashboard', builder: (_, __) => const DashboardScreen()),
    ],
  );
});
