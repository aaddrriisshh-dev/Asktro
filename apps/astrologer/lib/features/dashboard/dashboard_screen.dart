import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../ui/celestial.dart';
import 'home_tab.dart';
import '../consultation/incoming_call.dart';
import 'presence_heartbeat.dart';
import '../consultation/consultations_tab.dart';
import '../wallet/wallet_tab.dart';
import '../notifications/notifications_tab.dart';
import '../profile/profile_tab.dart';
import 'pending_review_screen.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  static const _tabs = [
    HomeTab(),
    ConsultationsTab(),
    WalletTab(),
    NotificationsTab(),
    ProfileTab(),
  ];

  @override
  Widget build(BuildContext context) {
    ref.watch(pushRegistrationProvider); // register FCM once signed in
    final index = ref.watch(dashTabProvider);
    final self = ref.watch(selfProvider);
    final rows = ref.watch(sessionRowsProvider).valueOrNull ?? const [];
    final pending = rows.where((r) => r.c.status == ConsultationStatus.waiting).length;
    final unread = (ref.watch(notificationsProvider).valueOrNull ?? const [])
        .where((n) => n['read'] != true)
        .length;

    return self.when(
      loading: () => const SkyScaffold(child: Center(child: CircularProgressIndicator(color: Sky.purple))),
      error: (_, __) => const SkyScaffold(child: ErrorStateView()),
      data: (astrologer) {
        if (astrologer == null || astrologer.status != AstrologerStatus.approved) {
          return PendingReviewScreen(status: astrologer?.status);
        }
        return SkyScaffold(
          bottomNavigationBar: _SkyNav(
            index: index,
            onTap: (i) => ref.read(dashTabProvider.notifier).state = i,
            badges: {1: pending, 3: unread},
          ),
          child: Stack(
            children: [
              IndexedStack(index: index, children: _tabs),
              // Invisible sentinel that raises the full-screen ring on a new request.
              IncomingCallGate(self: astrologer),
              // Invisible sentinel: presence heartbeat so a crashed/dropped app
              // is forced offline server-side (no "ghost online").
              PresenceHeartbeat(uid: astrologer.id),
            ],
          ),
        );
      },
    );
  }
}

class _SkyNav extends StatelessWidget {
  const _SkyNav({required this.index, required this.onTap, required this.badges});
  final int index;
  final ValueChanged<int> onTap;
  final Map<int, int> badges;

  static const _items = [
    (Icons.home_rounded, Icons.home_outlined, 'Home'),
    (Icons.forum_rounded, Icons.forum_outlined, 'Consults'),
    (Icons.account_balance_wallet_rounded, Icons.account_balance_wallet_outlined, 'Wallet'),
    (Icons.notifications_rounded, Icons.notifications_none_rounded, 'Alerts'),
    (Icons.person_rounded, Icons.person_outline_rounded, 'Profile'),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Sky.card,
        border: Border(top: BorderSide(color: Sky.line)),
        boxShadow: [BoxShadow(color: Color(0x0F5B3FB0), blurRadius: 20, offset: Offset(0, -6))],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              for (var i = 0; i < _items.length; i++)
                _NavItem(
                  active: index == i,
                  filled: _items[i].$1,
                  outline: _items[i].$2,
                  label: _items[i].$3,
                  badge: badges[i] ?? 0,
                  onTap: () => onTap(i),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.active,
    required this.filled,
    required this.outline,
    required this.label,
    required this.badge,
    required this.onTap,
  });
  final bool active;
  final IconData filled;
  final IconData outline;
  final String label;
  final int badge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = active ? Sky.purple : Sky.ink3;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
                  decoration: BoxDecoration(
                    color: active ? Sky.purple.withValues(alpha: 0.10) : Colors.transparent,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Icon(active ? filled : outline, size: 22, color: color),
                ),
                if (badge > 0)
                  Positioned(
                    right: 2,
                    top: -4,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                      constraints: const BoxConstraints(minWidth: 16),
                      decoration: BoxDecoration(gradient: Sky.goldGrad, borderRadius: BorderRadius.circular(999)),
                      child: Text('${badge > 9 ? '9+' : badge}',
                          textAlign: TextAlign.center,
                          style: Sky.label.copyWith(fontSize: 9.5, color: Sky.purpleDeep, fontWeight: FontWeight.w800),),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 3),
            Text(label, style: Sky.label.copyWith(fontSize: 10.5, color: color, fontWeight: active ? FontWeight.w700 : FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
