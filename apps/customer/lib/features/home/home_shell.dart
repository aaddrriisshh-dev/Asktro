import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import 'home_feed.dart';
import 'home_popup_config.dart';
import '../consultations/consultations_tab.dart';
import '../consultation/chat_deeplink_screen.dart';
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
  // Notifications is NOT a bottom tab — it's opened as a full screen from the
  // top bar's bell (the bottom "Alerts" tab was redundant with it). Order here
  // is the nav index: Home 0, Consults 1, Wallet 2, Mall 3, Profile 4.
  static const _tabs = [
    HomeFeed(),
    ConsultationsTab(),
    WalletTab(),
    StoreHomeScreen(embedded: true),
    ProfileTab(),
  ];

  StreamSubscription<RemoteMessage>? _openedSub;
  StreamSubscription<RemoteMessage>? _foregroundSub;
  DateTime? _lastBackAt;
  // Visited-tab history for system-back navigation, and a guard so the back
  // navigation we trigger isn't recorded as a new visit.
  final List<int> _tabHistory = [];
  // Tabs build lazily: a tab's screen (and all its Firestore listeners) only
  // mount once the user first opens it, instead of all six firing on launch.
  // Home (0) is built immediately; visited tabs stay built to preserve state.
  final Set<int> _visitedTabs = {0};
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
    final deeplink = (data['deeplink'] as String?) ?? '';
    // A chat-message notification opens the conversation DIRECTLY — never the
    // promo popup. (It carries the astrologer's photo as its image, which would
    // otherwise fall into the image/promo path below and show "View offer".)
    if (deeplink.startsWith('asktro://chat/')) {
      final cid = deeplink.substring('asktro://chat/'.length);
      if (cid.isNotEmpty) {
        ref.read(promoSuppressedProvider.notifier).state = true;
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => ChatDeepLinkScreen(consultationId: cid)),
        );
      }
      return;
    }
    final theme = promoThemeById(data['theme'] as String?);
    final mode = (data['displayMode'] as String?) ?? 'small';
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
      // Nothing themed or deep-linked to open — open their notifications so the
      // tap always lands somewhere, instead of dumping them on Home.
      if (mounted) {
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NotificationsTab()));
      }
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

  /// True only while the Home shell is the frontmost screen. Guards every promo
  /// popup so an offer never rises on top of a chat (or any screen) the user
  /// opened — e.g. after tapping a "new message" notification.
  bool _homeIsFront() => ModalRoute.of(context)?.isCurrent ?? false;

  // On app open: a user who has NOT recharged yet sees the "Triple Dhamaka"
  // welcome offer (every launch, dismissible). Everyone else gets the usual
  // coupon popup. Waits briefly for the profile stream to have data first.
  Future<void> _maybeShowWelcomeOrOffer() async {
    // Launched by tapping a notification → skip the auto-offer entirely.
    if (ref.read(promoSuppressedProvider)) return;
    var profile = ref.read(myProfileProvider).valueOrNull;
    for (var i = 0; i < 10 && profile == null && mounted; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 200));
      profile = ref.read(myProfileProvider).valueOrNull;
    }
    if (!mounted) return;
    // A portal-managed home pop-up (targeted paid/unpaid/all) takes priority.
    if (await _maybeShowHomePopup(profile)) return;
    if (profile != null && !profile.hasRecharged) {
      // Let the user land, take in the home screen and even start scrolling
      // BEFORE the offer rises — so it reads as a considered nudge, not the very
      // first thing thrust at them the instant the app opens. (Runs off a
      // post-frame callback, so this never delays the home screen appearing.)
      await Future<void>.delayed(const Duration(milliseconds: 4000));
      if (!mounted || !_homeIsFront()) return;
      await showWelcomeOffer(context, chatCreditPaise: profile.chatBonusBalance);
      return;
    }
    await _maybeShowOfferPopup();
  }

  // The portal Home Pop-up (`homeSections/popup`): if active and its audience
  // matches this user's paid state, show it once per launch and return true so
  // the welcome/coupon popups stand down. Silent when off or not targeted.
  Future<bool> _maybeShowHomePopup(dynamic profile) async {
    if (ref.read(homePopupShownProvider)) return false;
    var cfg = ref.read(homePopupProvider).valueOrNull;
    for (var i = 0; i < 8 && cfg == null && mounted; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 150));
      cfg = ref.read(homePopupProvider).valueOrNull;
    }
    if (!mounted || cfg == null || !cfg.active) return false;
    final hasRecharged = (profile?.hasRecharged as bool?) ?? false;
    if (!cfg.matches(hasRecharged: hasRecharged)) return false;
    if (cfg.title.trim().isEmpty && cfg.body.trim().isEmpty && cfg.image.trim().isEmpty) return false;

    ref.read(homePopupShownProvider.notifier).state = true;
    // Let the user land first, like the other home popups.
    await Future<void>.delayed(const Duration(milliseconds: 4000));
    if (!mounted || !_homeIsFront()) return true;

    final theme = promoThemeById(cfg.theme.isEmpty ? null : cfg.theme);
    // Half/full takeovers need a theme; without one, fall back to the card.
    final mode = (theme == null && cfg.displayMode != 'small') ? 'small' : cfg.displayMode;
    await showPromoPopup(
      context,
      theme: theme,
      displayMode: mode,
      title: cfg.title,
      body: cfg.body,
      ctaLabel: cfg.ctaLabel.isNotEmpty ? cfg.ctaLabel : 'Grab this offer',
      code: cfg.code.isEmpty ? null : cfg.code,
      imageUrl: cfg.image.isEmpty ? null : cfg.image,
      imageStyle: cfg.imageStyle,
      imageFill: cfg.imageFill && cfg.image.isNotEmpty,
      onAction: () => _followDeeplink(cfg!.deeplink),
    );
    return true;
  }

  // On app open, surface the newest active coupon once per launch. Silent if
  // there are no offers or the fetch fails — never blocks the home screen.
  Future<void> _maybeShowOfferPopup() async {
    if (ref.read(offerPopupShownProvider)) return;
    try {
      // Server-fetch (not the cache-first live stream) so a deleted coupon still
      // sitting in Firestore's offline cache can never surface as the popup.
      final coupons = await ref.read(catalogRepositoryProvider).fetchActiveCoupons();
      if (!mounted || coupons.isEmpty || !_homeIsFront()) return;
      ref.read(offerPopupShownProvider.notifier).state = true;
      await showOfferPopup(context, coupons.first);
    } catch (_) {
      // No offers / offline / rules — ignore, home loads normally.
    }
  }

  @override
  Widget build(BuildContext context) {
    // Register FCM token + analytics user id once signed in.
    ref.watch(pushRegistrationProvider);

    // Record every tab change (from any source: taps, deep links, push) into a
    // history stack so the system back button retraces the tabs the user
    // actually visited. Programmatic back-navigation is flagged so it isn't
    // itself recorded.
    ref.listen<int>(homeTabProvider, (prev, next) {
      _visitedTabs.add(next); // first visit → that tab (and its listeners) mounts
      if (_handlingBack || prev == null || prev == next) return;
      _tabHistory.add(prev);
      if (_tabHistory.length > 20) _tabHistory.removeAt(0);
    });

    final index = ref.watch(homeTabProvider);
    _visitedTabs.add(index); // ensure the current tab is always built
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
      body: IndexedStack(
        index: index,
        children: List.generate(
          _tabs.length,
          (i) => _visitedTabs.contains(i) ? _tabs[i] : const SizedBox.shrink(),
        ),
      ),
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
              destinations: const [
                NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
                NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: 'Consults'),
                NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet), label: 'Wallet'),
                // Mall stands out in Asktro purple so the store is unmistakable.
                NavigationDestination(
                  icon: Icon(Icons.storefront, color: AppColors.primary),
                  selectedIcon: Icon(Icons.storefront, color: AppColors.primary),
                  label: 'Mall',
                ),
                NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
              ],
            ),
          ),
        ),
      ),
      ),
    );
  }
}
