import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import 'home_feed.dart';
import '../consultations/consultations_tab.dart';
import '../wallet/wallet_tab.dart';
import '../wallet/offers_screen.dart';
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
    ProfileTab(),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeShowOfferPopup());
  }

  // On app open, surface the newest active coupon once per launch. Silent if
  // there are no offers or the fetch fails — never blocks the home screen.
  Future<void> _maybeShowOfferPopup() async {
    if (ref.read(offerPopupShownProvider)) return;
    try {
      final coupons = await ref.read(catalogRepositoryProvider).watchCoupons().first;
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

    final index = ref.watch(homeTabProvider);
    return Scaffold(
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
                const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
              ],
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
