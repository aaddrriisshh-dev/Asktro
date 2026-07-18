import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import 'home_feed.dart';
import '../consultations/consultations_tab.dart';
import '../wallet/wallet_tab.dart';
import '../wallet/offers_screen.dart';
import '../wallet/promo_popup.dart';
import '../promo/welcome_offer.dart';
import '../store/store_home_screen.dart';
import '../notifications/notifications_tab.dart';
import '../profile/profile_tab.dart';

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  static const _tabs = [
    HomeFeed(),
    ConsultationsTab(),
    WalletTab(),
    NotificationsTab(),
    StoreHomeScreen(embedded: true),
    ProfileTab(),
  ];

  StreamSubscription<RemoteMessage>? _openedSub;
  StreamSubscription<RemoteMessage>? _foregroundSub;
  DateTime? _lastBackAt;
  // Visited-tab history for system-back navigation, and a guard so the back
  // navigation we trigger isn't recorded as a new visit.
  final List<int> _tabHistory = [];
  bool _handlingBack = false;

  /// Switch tabs as part of a back-navigation (not recorded in history).
  void _goToTab(int i) {
    _handlingBack = true;
    ref.read(homeTabProvider.notifier).state = i;
    WidgetsBinding.instance.addPostFrameCallback((_) => _handlingBack = false);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _maybeShowWelcomeOrOffer();
      _setupPushTapHandlers();
    });
  }

  @override
  void dispose() {
    _openedSub?.cancel();
    _foregroundSub?.cancel();
    super.dispose();
  }

  // Handle a tapped push notification: a themed half/full promo opens the shared
  // landing popup; anything else just follows its deeplink. Covers both a
  // cold-start tap (getInitialMessage) and a tap while backgrounded
  // (onMessageOpenedApp).
  void _setupPushTapHandlers() {
    FirebaseMessaging.instance.getInitialMessage().then((m) {
      if (m != null) _handlePushTap(m);
    });
    _openedSub = FirebaseMessaging.onMessageOpenedApp.listen(_handlePushTap);
    // Foreground: Android shows no system notification while the app is open,
    // so surface an in-app banner with a View action that opens the landing.
    _foregroundSub = FirebaseMessaging.onMessage.listen(_handleForeground);
  }

  void _handleForeground(RemoteMessage m) {
    if (!mounted) return;
    final title = m.notification?.title ?? (m.data['landingTitle'] as String?) ?? 'New notification';
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(title, maxLines: 2, overflow: TextOverflow.ellipsis),
        duration: const Duration(seconds: 5),
        action: SnackBarAction(label: 'View', onPressed: () => _handlePushTap(m)),
      ),);
  }

  void _handlePushTap(RemoteMessage m) {
    if (!mounted) return;
    final data = m.data;
    final theme = promoThemeById(data['theme'] as String?);
    final mode = (data['displayMode'] as String?) ?? 'small';
    final deeplink = (data['deeplink'] as String?) ?? '';
    final imageStyle = (data['imageStyle'] as String?) ?? 'banner';
    // Prefer the portrait upload when the admin picked the portrait style.
    final portrait = data['portraitImage'] as String?;
    final banner = data['image'] as String?;
    final imageUrl = (imageStyle == 'portrait' && portrait != null && portrait.isNotEmpty) ? portrait : banner;
    final hasImage = imageUrl != null && imageUrl.isNotEmpty;
    String pick(String? landing, String? fallback) =>
        (landing != null && landing.isNotEmpty) ? landing : (fallback ?? '');
    // Any themed or image-bearing push opens the shared popup — small renders a
    // centre card, half a bottom sheet, full a takeover. Only a plain push
    // (no theme, no image) falls straight through to its deeplink.
    if (theme != null || hasImage) {
      showPromoPopup(
        context,
        theme: theme,
        displayMode: mode,
        title: pick(data['landingTitle'] as String?, m.notification?.title),
        body: pick(data['landingBody'] as String?, m.notification?.body),
        ctaLabel: (data['ctaText'] as String?)?.isNotEmpty ?? false ? data['ctaText'] as String : 'View offer',
        heroKicker: '✦  JUST FOR YOU',
        heroTagline: null,
        imageUrl: imageUrl,
        imageStyle: imageStyle,
        onAction: () => _followDeeplink(deeplink),
      );
    } else if (deeplink.isNotEmpty) {
      _followDeeplink(deeplink);
    } else {
      // Nothing themed or deep-linked to open — take them to their notifications
      // so the tap always lands somewhere, instead of dumping them on Home.
      ref.read(homeTabProvider.notifier).state = 3;
    }
  }

  void _followDeeplink(String dl) {
    if (dl.isEmpty || !mounted) return;
    if (dl.startsWith('/')) {
      context.push(dl);
    } else if (dl.startsWith('asktro://')) {
      context.push('/${dl.substring('asktro://'.length)}');
    }
  }

  // On app open: a user who has NOT recharged yet sees the "Triple Dhamaka"
  // welcome offer (every launch, dismissible). Everyone else gets the usual
  // coupon popup. Waits briefly for the profile stream to have data first.
  Future<void> _maybeShowWelcomeOrOffer() async {
    var profile = ref.read(myProfileProvider).valueOrNull;
    for (var i = 0; i < 10 && profile == null && mounted; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 200));
      profile = ref.read(myProfileProvider).valueOrNull;
    }
    if (!mounted) return;
    if (profile != null && !profile.hasRecharged) {
      // Let the user land, take in the home screen and even start scrolling
      // BEFORE the offer rises — so it reads as a considered nudge, not the very
      // first thing thrust at them the instant the app opens.
      await Future<void>.delayed(const Duration(milliseconds: 4800));
      if (!mounted) return;
      if (!mounted) return;
      await showWelcomeOffer(context, chatCreditPaise: profile.chatBonusBalance);
      return;
    }
    await _maybeShowOfferPopup();
  }

  // On app open, surface the newest active coupon once per launch. Silent if
  // there are no offers or the fetch fails — never blocks the home screen.
  Future<void> _maybeShowOfferPopup() async {
    if (ref.read(offerPopupShownProvider)) return;
    try {
      // Server-fetch (not the cache-first live stream) so a deleted coupon still
      // sitting in Firestore's offline cache can never surface as the popup.
      final coupons = await ref.read(catalogRepositoryProvider).fetchActiveCoupons();
      if (!mounted || coupons.isEmpty) return;
      ref.read(offerPopupShownProvider.notifier).state = true;
      await showOfferPopup(context, coupons.first);
    } catch (_) {
      // No offers / offline / rules — ignore, home loads normally.
    }
  }

  @override
  Widget build(BuildContext context) {
    final uid = ref.watch(currentUidProvider);
    // Register FCM token + analytics user id once signed in.
    ref.watch(pushRegistrationProvider);
    final unread = uid == null
        ? const AsyncValue<int>.data(0)
        : ref.watch(_unreadProvider(uid));

    // Record every tab change (from any source: taps, deep links, push) into a
    // history stack so the system back button retraces the tabs the user
    // actually visited. Programmatic back-navigation is flagged so it isn't
    // itself recorded.
    ref.listen<int>(homeTabProvider, (prev, next) {
      if (_handlingBack || prev == null || prev == next) return;
      _tabHistory.add(prev);
      if (_tabHistory.length > 20) _tabHistory.removeAt(0);
    });

    final index = ref.watch(homeTabProvider);
    // The bottom-nav tabs are an IndexedStack, not routes, so the Android system
    // back button would otherwise exit the app from any tab. Intercept it: go
    // back to the previously visited tab; if there's no history, go to Home;
    // on Home with no history, require a second back within 2s to exit.
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        if (_tabHistory.isNotEmpty) {
          _goToTab(_tabHistory.removeLast());
          return;
        }
        if (index != 0) {
          _goToTab(0);
          return;
        }
        final now = DateTime.now();
        if (_lastBackAt == null || now.difference(_lastBackAt!) > const Duration(seconds: 2)) {
          _lastBackAt = now;
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(const SnackBar(
              content: Text('Press back again to exit'),
              duration: Duration(seconds: 2),
            ),);
          return;
        }
        SystemNavigator.pop();
      },
      child: Scaffold(
      body: IndexedStack(index: index, children: _tabs),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: AppColors.card,
          boxShadow: AppShadows.soft,
        ),
        child: SafeArea(
          top: false,
          child: NavigationBarTheme(
            data: NavigationBarThemeData(
              backgroundColor: AppColors.card,
              indicatorColor: AppColors.accentLavender,
              labelTextStyle: WidgetStatePropertyAll(AppTypography.caption.copyWith(fontSize: 12)),
            ),
            child: NavigationBar(
              selectedIndex: index,
              height: 66,
              onDestinationSelected: (i) => ref.read(homeTabProvider.notifier).state = i,
              destinations: [
                const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
                const NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: 'Consults'),
                const NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet), label: 'Wallet'),
                NavigationDestination(
                  icon: _BellIcon(count: unread.valueOrNull ?? 0, filled: false),
                  selectedIcon: _BellIcon(count: unread.valueOrNull ?? 0, filled: true),
                  label: 'Alerts',
                ),
                const NavigationDestination(icon: Icon(Icons.storefront_outlined), selectedIcon: Icon(Icons.storefront), label: 'Mall'),
                const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
              ],
            ),
          ),
        ),
      ),
      ),
    );
  }
}

final _unreadProvider = StreamProvider.family<int, String>((ref, uid) {
  return ref.watch(notificationRepositoryProvider).unreadCount(uid);
});

class _BellIcon extends StatelessWidget {
  const _BellIcon({required this.count, required this.filled});
  final int count;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Icon(filled ? Icons.notifications : Icons.notifications_none),
        if (count > 0)
          Positioned(
            right: -4,
            top: -4,
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: const BoxDecoration(color: AppColors.error, shape: BoxShape.circle),
              constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
              child: Text(
                count > 9 ? '9+' : '$count',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold),
              ),
            ),
          ),
      ],
    );
  }
}
