import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import 'home_tab.dart';
import '../earnings/earnings_tab.dart';
import '../history/history_tab.dart';
import '../profile/profile_tab.dart';
import 'pending_review_screen.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  int _index = 0;
  static const _tabs = [HomeTab(), EarningsTab(), HistoryTab(), ProfileTab()];

  @override
  Widget build(BuildContext context) {
    ref.watch(pushRegistrationProvider); // register FCM once signed in
    final self = ref.watch(selfProvider);

    return self.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator(color: AppColors.primary))),
      error: (_, __) => const Scaffold(body: ErrorStateView()),
      data: (astrologer) {
        // Approval gating (Part 5): no dashboard until approved.
        if (astrologer == null || astrologer.status != AstrologerStatus.approved) {
          return PendingReviewScreen(status: astrologer?.status);
        }
        return Scaffold(
          body: IndexedStack(index: _index, children: _tabs),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _index,
            height: 66,
            onDestinationSelected: (i) => setState(() => _index = i),
            destinations: const [
              NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Home'),
              NavigationDestination(icon: Icon(Icons.payments_outlined), selectedIcon: Icon(Icons.payments), label: 'Earnings'),
              NavigationDestination(icon: Icon(Icons.history_rounded), label: 'History'),
              NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
            ],
          ),
        );
      },
    );
  }
}
