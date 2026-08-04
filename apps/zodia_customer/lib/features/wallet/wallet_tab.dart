import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';

final _txnsProvider = StreamProvider.autoDispose<List<WalletTransaction>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref.watch(walletRepositoryProvider).watchTransactions(uid);
});

class WalletTab extends ConsumerWidget {
  const WalletTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(myProfileProvider).valueOrNull;
    final txns = ref.watch(_txnsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Wallet')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          GradientCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Available balance', style: AppTypography.caption.copyWith(color: Colors.white70)),
                const SizedBox(height: AppSpacing.sm),
                AnimatedBalance(
                  paise: profile?.spendablePaise ?? 0,
                  style: AppTypography.headline.copyWith(color: Colors.white),
                ),
                if ((profile?.bonusBalance ?? 0) > 0) ...[
                  const SizedBox(height: 4),
                  Text('Includes ${Money.formatPaise(profile!.bonusBalance)} bonus',
                      style: AppTypography.caption.copyWith(color: Colors.white70),),
                ],
                if ((profile?.chatBonusBalance ?? 0) > 0) ...[
                  const SizedBox(height: 4),
                  Text('+ ${Money.formatPaise(profile!.chatBonusBalance)} free chat credit',
                      style: AppTypography.caption.copyWith(color: Colors.white70),),
                ],
                const SizedBox(height: AppSpacing.lg),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: AppColors.primary,
                      shape: const RoundedRectangleBorder(borderRadius: AppRadius.buttonR),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    onPressed: () => context.push('/recharge'),
                    icon: const Icon(Icons.add_rounded),
                    label: const Text('Recharge'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.xl),
          Text('Transaction history', style: AppTypography.subtitle),
          const SizedBox(height: AppSpacing.md),
          txns.when(
            loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
            error: (_, __) => const ErrorStateView(),
            data: (list) {
              if (list.isEmpty) {
                return const EmptyState(
                  icon: Icons.receipt_long_outlined,
                  title: 'No transactions yet',
                  message: 'Your recharges and consultation charges will appear here.',
                );
              }
              return Column(
                children: [for (final t in list) _TxnTile(t: t)],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _TxnTile extends StatelessWidget {
  const _TxnTile({required this.t});
  final WalletTransaction t;

  @override
  Widget build(BuildContext context) {
    final credit = t.isCredit;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: AppCard(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: (credit ? AppColors.success : AppColors.primary).withValues(alpha: 0.12),
              child: Icon(credit ? Icons.south_west_rounded : Icons.north_east_rounded,
                  color: credit ? AppColors.success : AppColors.primary, size: 20,),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Text(t.note ?? t.kind.name,
                  style: AppTypography.body, maxLines: 1, overflow: TextOverflow.ellipsis,),
            ),
            Text(
              '${credit ? '+' : '-'}${Money.formatPaise(t.amount.abs())}',
              style: AppTypography.body.copyWith(
                fontWeight: FontWeight.w600,
                color: credit ? AppColors.success : AppColors.textDark,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
