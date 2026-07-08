import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
      appBar: AppBar(title: const Text('Your Personal Remedies')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (_, __) => const ErrorStateView(),
        data: (list) {
          return Column(
            children: [
              const _RemediesHeader(),
              Expanded(
                child: list.isEmpty
                    ? const EmptyState(
                        icon: Icons.self_improvement_rounded,
                        title: 'No remedies yet',
                        message: 'When an astrologer suggests a remedy during a consultation, it will appear here.',
                      )
                    : ListView.separated(
                        padding: EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg,
                            AppSpacing.lg + MediaQuery.of(context).padding.bottom,),
                        itemCount: list.length,
                        separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.md),
                        itemBuilder: (_, i) => _RemedyCard(data: list[i]),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// A calm celestial banner that names the screen and sets the tone.
class _RemediesHeader extends StatelessWidget {
  const _RemediesHeader();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, AppSpacing.sm),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: AppColors.lavenderGradient,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.accentLavender),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: const BoxDecoration(gradient: AppColors.primaryGradient, shape: BoxShape.circle),
            child: const Icon(Icons.self_improvement_rounded, color: Colors.white, size: 24),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Your Personal Remedies',
                    style: AppTypography.body.copyWith(fontWeight: FontWeight.w800, fontSize: 16),),
                const SizedBox(height: 2),
                Text('Rituals & remedies your astrologers chose, just for you ✦',
                    style: AppTypography.caption.copyWith(color: AppColors.textSecondary),),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RemedyCard extends StatefulWidget {
  const _RemedyCard({required this.data});
  final Map<String, dynamic> data;

  @override
  State<_RemedyCard> createState() => _RemedyCardState();
}

class _RemedyCardState extends State<_RemedyCard> {
  bool _accepted = false;

  void _accept() {
    HapticFeedback.lightImpact();
    setState(() => _accepted = true);
  }

  @override
  Widget build(BuildContext context) {
    final title = (widget.data['title'] ?? 'Remedy') as String;
    final note = (widget.data['note'] ?? '') as String;
    final astro = (widget.data['astrologerName'] ?? 'Astrologer') as String;
    final photo = widget.data['astrologerPhoto'] as String?;

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
                    overflow: TextOverflow.ellipsis,),
              ),
            ],
          ),
          if (note.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(note, style: AppTypography.body.copyWith(height: 1.35)),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              AppAvatar(name: astro, photoUrl: photo, size: 22),
              const SizedBox(width: 7),
              Text('Suggested by $astro',
                  style: AppTypography.caption.copyWith(color: AppColors.textSecondary),),
            ],
          ),
          const SizedBox(height: 14),
          // A gentle, untracked call-to-action — a little cosmic moment for the
          // customer to affirm the remedy. Intentionally not persisted.
          _accepted
              ? Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.success.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.success.withValues(alpha: 0.35)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.auto_awesome_rounded, size: 16, color: AppColors.success),
                      const SizedBox(width: 8),
                      Text('Noted ✨ — may it bring you light',
                          style: AppTypography.body.copyWith(
                              color: AppColors.success, fontWeight: FontWeight.w700, fontSize: 13.5,),),
                    ],
                  ),
                )
              : GestureDetector(
                  onTap: _accept,
                  behavior: HitTestBehavior.opaque,
                  child: Container(
                    width: double.infinity,
                    height: 46,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      gradient: AppColors.primaryGradient,
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: AppShadows.soft,
                    ),
                    child: Text("Thanks, I'll do it 🙏",
                        style: AppTypography.body.copyWith(
                            color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14.5,),),
                  ),
                ),
        ],
      ),
    );
  }
}
