import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';

final _recentProvider = StreamProvider.autoDispose<List<Consultation>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref.watch(astrologerRepositoryProvider).watchSessions(uid, statuses: ['completed', 'expired']);
});

class EarningsTab extends ConsumerStatefulWidget {
  const EarningsTab({super.key});

  @override
  ConsumerState<EarningsTab> createState() => _EarningsTabState();
}

class _EarningsTabState extends ConsumerState<EarningsTab> {
  bool _requesting = false;

  Future<void> _requestPayout(Astrologer self) async {
    if (self.pendingPayout <= 0) return;
    final upi = await _ask('Enter your UPI ID for payout');
    if (upi == null || upi.trim().isEmpty) return;
    setState(() => _requesting = true);
    try {
      // Block a second request while one is still open, so the same balance
      // cannot be requested twice before the admin processes it.
      final open = await ref
          .read(firestoreProvider)
          .collection('payouts')
          .where('astrologerId', isEqualTo: self.id)
          .get();
      final hasOpen = open.docs.any((d) {
        final s = d.data()['status'] as String?;
        return s == 'pending' || s == 'approved';
      });
      if (hasOpen) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('You already have a payout in progress.'),
          ));
        }
        return;
      }
      await ref.read(firestoreProvider).collection('payouts').add({
        'astrologerId': self.id,
        // Only the accrued, not-yet-paid balance (server decrements
        // pendingPayout when the admin marks it processed).
        'amount': self.pendingPayout,
        'method': 'upi',
        'upi': upi.trim(),
        'status': 'pending',
        'createdAt': FieldValue.serverTimestamp(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Payout requested.')));
      }
    } finally {
      if (mounted) setState(() => _requesting = false);
    }
  }

  Future<String?> _ask(String title) => showDialog<String>(
        context: context,
        builder: (_) {
          final c = TextEditingController();
          return AlertDialog(
            title: Text(title),
            content: TextField(controller: c, decoration: const InputDecoration(hintText: 'name@bank')),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
              TextButton(onPressed: () => Navigator.pop(context, c.text), child: const Text('Request')),
            ],
          );
        },
      );

  @override
  Widget build(BuildContext context) {
    final self = ref.watch(selfProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(title: const Text('Earnings')),
      body: self == null
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [
                GradientCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Lifetime earnings', style: AppTypography.caption.copyWith(color: Colors.white70)),
                      const SizedBox(height: AppSpacing.sm),
                      Text(Money.formatPaise(self.earnings),
                          style: AppTypography.headline.copyWith(color: Colors.white)),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                AppCard(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Available for payout', style: AppTypography.body),
                      Text(Money.formatPaise(self.pendingPayout),
                          style: AppTypography.subtitle.copyWith(color: AppColors.primary)),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                PrimaryButton(
                  label: 'Request payout',
                  icon: Icons.account_balance_outlined,
                  loading: _requesting,
                  onPressed: _requesting || self.pendingPayout <= 0 ? null : () => _requestPayout(self),
                ),
                const SizedBox(height: AppSpacing.xl),
                Text('Recent sessions', style: AppTypography.subtitle),
                const SizedBox(height: AppSpacing.md),
                const _RecentEarningsChart(),
              ],
            ),
    );
  }
}

/// Lightweight, dependency-free bar chart of the most recent completed sessions'
/// charged amounts (astrologer earns net of commission).
class _RecentEarningsChart extends ConsumerWidget {
  const _RecentEarningsChart();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessions = (ref.watch(_recentProvider).valueOrNull ?? const <Consultation>[])
        .take(7)
        .toList()
        .reversed
        .toList();
    if (sessions.isEmpty) {
      return const EmptyState(
        icon: Icons.bar_chart_rounded,
        title: 'No earnings yet',
        message: 'Completed consultations will appear here.',
      );
    }
    final maxCharge = sessions.map((s) => s.totalCharged).fold<int>(1, (a, b) => b > a ? b : a);
    return AppCard(
      child: SizedBox(
        height: 160,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            for (final s in sessions)
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(Money.formatPaise(s.totalCharged),
                        style: AppTypography.caption.copyWith(fontSize: 10)),
                    const SizedBox(height: 4),
                    Container(
                      margin: const EdgeInsets.symmetric(horizontal: 6),
                      height: 110 * (s.totalCharged / maxCharge).clamp(0.05, 1.0),
                      decoration: BoxDecoration(
                        gradient: AppColors.primaryGradient,
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(s.type.name.substring(0, 1).toUpperCase(),
                        style: AppTypography.caption.copyWith(fontSize: 10)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
