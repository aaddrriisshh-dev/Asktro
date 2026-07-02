import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';

class EarningsTab extends ConsumerStatefulWidget {
  const EarningsTab({super.key});

  @override
  ConsumerState<EarningsTab> createState() => _EarningsTabState();
}

class _EarningsTabState extends ConsumerState<EarningsTab> {
  bool _requesting = false;

  Future<void> _requestPayout(Astrologer self) async {
    final upi = await _ask('Enter your UPI ID for payout');
    if (upi == null || upi.trim().isEmpty) return;
    setState(() => _requesting = true);
    try {
      await ref.read(firestoreProvider).collection('payouts').add({
        'astrologerId': self.id,
        'amount': self.earnings, // pendingPayout mirror handled server-side on process
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
                      Text(Money.formatPaise(self.earnings),
                          style: AppTypography.subtitle.copyWith(color: AppColors.primary)),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                PrimaryButton(
                  label: 'Request payout',
                  icon: Icons.account_balance_outlined,
                  loading: _requesting,
                  onPressed: _requesting || self.earnings <= 0 ? null : () => _requestPayout(self),
                ),
              ],
            ),
    );
  }
}
