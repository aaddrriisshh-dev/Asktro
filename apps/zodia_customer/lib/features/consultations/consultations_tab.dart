import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../app/feature_flags.dart';
import '../consultation/chat_consultation_screen.dart';

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

/// The astrologer for a history tile, so we can show their name/photo and open
/// the transcript. Fetched once per id.
final _astrologerProvider = FutureProvider.autoDispose.family<Astrologer?, String>((ref, id) async {
  try {
    return await ref.watch(astrologerRepositoryProvider).watchOne(id).first;
  } catch (_) {
    return null;
  }
});

class ConsultationsTab extends ConsumerWidget {
  const ConsultationsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_historyProvider);
    return Scaffold(
      backgroundColor: AppColors.background,
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

class _HistoryTile extends ConsumerWidget {
  const _HistoryTile({required this.c});
  final Consultation c;

  IconData get _icon => switch (c.type) {
        ConsultationType.chat => Icons.chat_bubble_outline_rounded,
        ConsultationType.voice => Icons.call_outlined,
        ConsultationType.video => Icons.videocam_outlined,
      };

  String get _typeLabel =>
      '${c.type.name[0].toUpperCase()}${c.type.name.substring(1)}';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final astro = ref.watch(_astrologerProvider(c.astrologerId)).valueOrNull;
    final name = astro?.name ?? 'Astrologer';
    final photo = astro?.profilePhoto;
    final hasPhoto = photo != null && photo.isNotEmpty;
    final open = c.status.isOpen;

    void openChat() {
      if (astro == null) return;
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => ChatConsultationScreen(
          consultationId: c.id,
          astrologer: astro,
          readOnly: c.status.isTerminal,
        ),
      ),);
    }

    return GestureDetector(
      onTap: astro == null ? null : openChat,
      child: AppCard(
        child: Row(
          children: [
            hasPhoto
                ? AppAvatar(name: name, photoUrl: photo, size: 46)
                : Container(
                    width: 46,
                    height: 46,
                    decoration: const BoxDecoration(color: AppColors.accentLavender, shape: BoxShape.circle),
                    child: Icon(_icon, color: AppColors.primary),
                  ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      style: AppTypography.body.copyWith(fontWeight: FontWeight.w700),
                      overflow: TextOverflow.ellipsis,),
                  const SizedBox(height: 2),
                  Text('$_typeLabel • ${Money.formatDurationLong(c.duration)}',
                      style: AppTypography.caption,),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                // ... per-session charged amount hidden in free v1
                if (kMonetizationEnabled)
                  Text(Money.formatPaise(c.totalCharged),
                      style: AppTypography.body.copyWith(fontWeight: FontWeight.w700),),
                if (kMonetizationEnabled) const SizedBox(height: 4),
                open
                    ? Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: AppColors.success.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(AppRadius.chip),
                        ),
                        child: Text('Resume',
                            style: AppTypography.caption.copyWith(
                                color: AppColors.success, fontWeight: FontWeight.w800, fontSize: 11,),),
                      )
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('View chat',
                              style: AppTypography.caption.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700, fontSize: 11.5),),
                          const Icon(Icons.chevron_right_rounded, size: 16, color: AppColors.primary),
                        ],
                      ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
