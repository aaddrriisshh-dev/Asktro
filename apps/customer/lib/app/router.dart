import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_flutter/shared_flutter.dart';

import 'providers.dart';
import '../features/splash/splash_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/otp_screen.dart';
import '../features/home/home_shell.dart';
import '../features/profile_setup/profile_setup_screen.dart';
import '../features/astrologer/astrologer_profile_screen.dart';
import '../features/wallet/offers_screen.dart';
import '../features/wallet/recharge_screen.dart';
import '../features/store/store_models.dart';
import '../features/store/store_home_screen.dart';
import '../features/store/store_category_screen.dart';
import '../features/store/all_products_screen.dart';
import '../features/store/store_search_screen.dart';
import '../features/store/product_detail_screen.dart';
import '../features/store/cart_screen.dart';
import '../features/store/checkout_screen.dart';
import '../features/store/order_detail_screen.dart';
import '../features/store/my_orders_screen.dart';

/// Whether onboarding has been completed (persisted locally).
final onboardingDoneProvider = StateProvider<bool>((_) => false);

/// The account has the essentials the astrology engine actually needs: a real
/// name, a date of birth, and a birth place with coordinates. Birth TIME is
/// deliberately OPTIONAL — "don't know time" is allowed and the chart falls
/// back to noon. Until these three exist the user is held at profile setup and
/// is NEVER allowed to sit inside the app as a nameless "Guest".
bool profileEssentialsComplete(UserProfile? p) {
  if (p == null) return false;
  final name = p.name.trim();
  final hasName = name.isNotEmpty && name.toLowerCase() != 'guest';
  final hasDob = p.birthDateMs != null;
  final hasPlace = p.birthLat != null && p.birthLng != null;
  return hasName && hasDob && hasPlace;
}

/// A short floor so the launch animation registers, then Home appears the
/// instant the app is actually ready. The router ALSO holds on `auth.isLoading`
/// (real readiness), so the effective wait is max(this floor, auth restore) —
/// typically ~1s, not a fixed multi-second stare at the splash.
final splashGateProvider = FutureProvider<void>((ref) async {
  await Future<void>.delayed(const Duration(milliseconds: 1000));
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
  final profileAsync = ref.watch(myProfileProvider);

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/splash',
    redirect: (context, state) {
      final loc = state.matchedLocation;

      // Hold on splash while auth resolves and the launch animation plays.
      if (auth.isLoading || !splashReady) {
        return loc == '/splash' ? null : '/splash';
      }

      final loggedIn = auth.valueOrNull != null;
      final isAuthRoute = loc == '/login' || loc == '/otp';

      // Flow order (v2): splash -> login -> profile setup -> home. Profile
      // setup now runs AFTER login so details are written directly to the
      // signed-in account — no pre-login buffer, no hand-off race.

      // 1) Not signed in -> log in first.
      if (!loggedIn) {
        return isAuthRoute ? null : '/login';
      }

      // 2) Signed in: wait for the profile to load before judging it. Never
      //    guess "incomplete" while it's still loading, or a returning user
      //    with a full profile would flash the setup screen on every launch.
      if (profileAsync.isLoading && !profileAsync.hasValue) {
        return loc == '/splash' ? null : '/splash';
      }

      // 3) Signed in but essentials missing -> hold at profile setup (the gate).
      if (!profileEssentialsComplete(profileAsync.valueOrNull)) {
        return loc == '/setup' ? null : '/setup';
      }

      // 4) Signed in + complete: keep out of boot/auth/setup routes.
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
      GoRoute(path: '/home', builder: (_, __) => const HomeShell()),
      GoRoute(
        path: '/astrologer/:id',
        // `extra` optionally carries the skill the user browsed via (e.g.
        // 'Palmistry') so the AI can open palm-led. Null for normal navigation.
        builder: (_, s) => AstrologerProfileScreen(
          astrologerId: s.pathParameters['id']!,
          requestedSkill: s.extra as String?,
        ),
      ),
      GoRoute(
        path: '/recharge',
        // ?plan=<id> pre-selects a plan (Recharge banners); ?coupon=<CODE>
        // pre-fills + auto-applies a coupon (from the Offers screen);
        // ?lock=<paise> freezes the screen to that single amount (promo offers).
        builder: (_, s) => RechargeScreen(
          preselectPlanId: s.uri.queryParameters['plan'],
          preselectCoupon: s.uri.queryParameters['coupon'],
          lockAmountPaise: int.tryParse(s.uri.queryParameters['lock'] ?? ''),
        ),
      ),
      GoRoute(path: '/offers', builder: (_, __) => const OffersScreen()),

      // ---- Asktro Mall (store) ----
      GoRoute(path: '/store', builder: (_, __) => const StoreHomeScreen()),
      GoRoute(path: '/store/search', builder: (_, __) => const StoreSearchScreen()),
      GoRoute(
        path: '/store/products/:filter',
        builder: (_, s) {
          final f = s.pathParameters['filter'] ?? 'all';
          return AllProductsScreen(filter: f, title: AllProductsScreen.titleFor(f));
        },
      ),
      GoRoute(
        path: '/store/category/:id',
        builder: (_, s) => StoreCategoryScreen(
          categoryId: s.pathParameters['id']!,
          categoryName: s.extra as String?,
        ),
      ),
      GoRoute(
        path: '/store/product/:id',
        builder: (_, s) => ProductDetailScreen(
          productId: s.pathParameters['id']!,
          product: s.extra as StoreProduct?,
        ),
      ),
      GoRoute(path: '/store/cart', builder: (_, __) => const CartScreen()),
      GoRoute(path: '/store/checkout', builder: (_, __) => const CheckoutScreen()),
      GoRoute(path: '/store/orders', builder: (_, __) => const MyOrdersScreen()),
      GoRoute(
        path: '/store/order/:id',
        builder: (_, s) => OrderDetailScreen(
          orderId: s.pathParameters['id']!,
          justPlaced: s.uri.queryParameters['placed'] == '1',
        ),
      ),
    ],
    errorBuilder: (_, __) => const Scaffold(
      body: Center(child: Text('Page not found')),
    ),
  );
});
