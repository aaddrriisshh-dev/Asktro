import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';

/// Remedies astrologers have suggested to this customer. Sorted newest-first on
/// the client so no composite index is needed.
final _remediesProvider = StreamProvider.autoDispose<List<Map<String, dynamic>>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref
      .watch(firestoreProvider)
      .collection('remedies')
      .where('customerId', isEqualTo: uid)
      .limit(100)
      .snapshots()
      .map((s) {
    final list = s.docs.map((d) => {'id': d.id, ...d.data()}).toList();
    list.sort((a, b) {
      final ta = a['createdAt'];
      final tb = b['createdAt'];
      if (ta is Timestamp && tb is Timestamp) return tb.compareTo(ta);
      return 0;
    });
    return list;
  });
});

class SuggestedRemediesScreen extends ConsumerWidget {
  const SuggestedRemediesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_remediesProvider);
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Suggested Remedies')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (_, __) => const ErrorStateView(),
        data: (list) {
          if (list.isEmpty) {
            return const EmptyState(
              icon: Icons.self_improvement_rounded,
              title: 'No remedies yet',
              message: 'When an astrologer suggests a remedy during a consultation, it will appear here.',
            );
          }
          return ListView.separated(
            padding: EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg,
                AppSpacing.lg + MediaQuery.of(context).padding.bottom),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.md),
            itemBuilder: (_, i) => _RemedyCard(data: list[i]),
          );
        },
      ),
    );
  }
}

class _RemedyCard extends ConsumerWidget {
  const _RemedyCard({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final title = (data['title'] ?? 'Remedy') as String;
    final note = (data['note'] ?? '') as String;
    final astro = (data['astrologerName'] ?? 'Astrologer') as String;
    final photo = data['astrologerPhoto'] as String?;
    final done = data['done'] == true;

    void toggleDone() {
      ref
          .read(firestoreProvider)
          .collection('remedies')
          .doc(data['id'] as String)
          .update({'done': !done});
    }

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.self_improvement_rounded, size: 18, color: AppColors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(title,
                    style: AppTypography.body.copyWith(fontWeight: FontWeight.w800),
                    overflow: TextOverflow.ellipsis),
              ),
              GestureDetector(
                onTap: toggleDone,
                behavior: HitTestBehavior.opaque,
                child: Icon(
                  done ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
                  size: 22,
                  color: done ? AppColors.success : AppColors.textSecondary,
                ),
              ),
            ],
          ),
          if (note.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(note, style: AppTypography.body.copyWith(height: 1.35)),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              AppAvatar(name: astro, photoUrl: photo, size: 22),
              const SizedBox(width: 7),
              Text('Suggested by $astro',
                  style: AppTypography.caption.copyWith(color: AppColors.textSecondary)),
            ],
          ),
        ],
      ),
    );
  }
}
