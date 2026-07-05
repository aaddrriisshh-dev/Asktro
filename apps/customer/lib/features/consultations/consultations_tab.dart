import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';

/// Consultation history for the current customer (Part 3).
final _historyProvider = StreamProvider.autoDispose<List<Consultation>>((ref) {
  final uid = ref.watch(currentUidProvider);
  final db = ref.watch(firestoreProvider);
  if (uid == null) return const Stream.empty();
  return db
      .collection('consultations')
      .where('customerId', isEqualTo: uid)
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .map((s) => s.docs.map((d) => Consultation.fromMap(d.id, d.data())).toList());
});

class ConsultationsTab extends ConsumerWidget {
  const ConsultationsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_historyProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Consultations')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (_, __) => const ErrorStateView(),
        data: (list) {
          if (list.isEmpty) {
            return const EmptyState(
              icon: Icons.chat_bubble_outline_rounded,
              title: 'No consultations yet',
              message: 'Your chat, voice and video consultations will appear here.',
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(AppSpacing.lg),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.md),
            itemBuilder: (_, i) => _HistoryTile(c: list[i]),
          );
        },
      ),
    );
  }
}

class _HistoryTile extends StatelessWidget {
  const _HistoryTile({required this.c});
  final Consultation c;

  IconData get _icon => switch (c.type) {
        ConsultationType.chat => Icons.chat_bubble_outline_rounded,
        ConsultationType.voice => Icons.call_outlined,
        ConsultationType.video => Icons.videocam_outlined,
      };

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: const BoxDecoration(color: AppColors.accentLavender, shape: BoxShape.circle),
            child: Icon(_icon, color: AppColors.primary),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${c.type.name[0].toUpperCase()}${c.type.name.substring(1)} consultation',
                    style: AppTypography.body.copyWith(fontWeight: FontWeight.w600),),
                const SizedBox(height: 2),
                Text('${Money.formatDurationLong(c.duration)} • ${c.status.name}',
                    style: AppTypography.caption,),
              ],
            ),
          ),
          Text(Money.formatPaise(c.totalCharged),
              style: AppTypography.body.copyWith(fontWeight: FontWeight.w600),),
        ],
      ),
    );
  }
}
