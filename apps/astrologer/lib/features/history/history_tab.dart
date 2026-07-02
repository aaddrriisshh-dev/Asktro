import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';

final _historyProvider = StreamProvider.autoDispose<List<Consultation>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref.watch(astrologerRepositoryProvider).watchSessions(
    uid,
    statuses: ['completed', 'expired', 'cancelled'],
  );
});

class HistoryTab extends ConsumerWidget {
  const HistoryTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_historyProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('History')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (_, __) => const ErrorStateView(),
        data: (list) {
          if (list.isEmpty) {
            return const EmptyState(
              icon: Icons.history_rounded,
              title: 'No consultations yet',
              message: 'Completed consultations will appear here.',
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(AppSpacing.lg),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.md),
            itemBuilder: (_, i) {
              final c = list[i];
              return AppCard(
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: const BoxDecoration(color: AppColors.accentLavender, shape: BoxShape.circle),
                      child: const Icon(Icons.person_outline, color: AppColors.primary),
                    ),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${c.type.name} • ${c.status.name}',
                              style: AppTypography.body.copyWith(fontWeight: FontWeight.w600)),
                          Text(Money.formatDurationLong(c.duration), style: AppTypography.caption),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}
