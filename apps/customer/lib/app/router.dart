import 'dart:convert';

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

/// Onboarding details collected before login are buffered on disk (not just in
/// memory) so they survive an app kill/restart during the login/OTP step and
/// still reach the profile once the user signs in.
Future<void> writePendingProfile(Map<String, dynamic> data) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString('pending_profile', jsonEncode(data));
}

Future<Map<String, dynamic>?> readPendingProfile() async {
  final prefs = await SharedPreferences.getInstance();
  final raw = prefs.getString('pending_profile');
  if (raw == null || raw.isEmpty) return null;
  try {
    return (jsonDecode(raw) as Map).cast<String, dynamic>();
  } catch (_) {
    return null;
  }
}

Future<void> clearPendingProfile() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.remove('pending_profile');
}

/// Holds the router on the splash long enough for the launch animation to play.
final splashGateProvider = FutureProvider<void>((ref) async {
  await Future<void>.delayed(const Duration(milliseconds: 4200));
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
