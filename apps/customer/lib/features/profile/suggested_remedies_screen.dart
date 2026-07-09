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

  void _openRemedy(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => RemedyDetailScreen(data: widget.data)),
    );
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
            Text(note,
                style: AppTypography.body.copyWith(height: 1.35),
                maxLines: 3,
                overflow: TextOverflow.ellipsis),
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
          // Two actions side by side: open the full remedy, or affirm it.
          Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () => _openRemedy(context),
                  behavior: HitTestBehavior.opaque,
                  child: Container(
                    height: 46,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.primary.withValues(alpha: 0.35)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.auto_stories_rounded, size: 16, color: AppColors.primary),
                        const SizedBox(width: 6),
                        Text('Open remedy',
                            style: AppTypography.body.copyWith(
                                color: AppColors.primary, fontWeight: FontWeight.w700, fontSize: 13.5)),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _accepted
                    ? Container(
                        height: 46,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppColors.success.withValues(alpha: 0.10),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppColors.success.withValues(alpha: 0.35)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.check_circle_rounded, size: 16, color: AppColors.success),
                            const SizedBox(width: 6),
                            Text('Noted ✨',
                                style: AppTypography.body.copyWith(
                                    color: AppColors.success, fontWeight: FontWeight.w700, fontSize: 13.5)),
                          ],
                        ),
                      )
                    : GestureDetector(
                        onTap: _accept,
                        behavior: HitTestBehavior.opaque,
                        child: Container(
                          height: 46,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            gradient: AppColors.primaryGradient,
                            borderRadius: BorderRadius.circular(14),
                            boxShadow: AppShadows.soft,
                          ),
                          child: Text("Thanks, I'll do it 🙏",
                              style: AppTypography.body.copyWith(
                                  color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12.5),
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                        ),
                      ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A calm, full-screen reading view for a single remedy — the whole text,
/// scrollable, inside a celestial lavender→gold box (the same palette as the
/// remedy card that appears in a live chat), with a gentle affirming CTA.
class RemedyDetailScreen extends StatefulWidget {
  const RemedyDetailScreen({required this.data, super.key});
  final Map<String, dynamic> data;

  @override
  State<RemedyDetailScreen> createState() => _RemedyDetailScreenState();
}

class _RemedyDetailScreenState extends State<RemedyDetailScreen> {
  bool _followed = false;

  void _follow() {
    HapticFeedback.mediumImpact();
    setState(() => _followed = true);
  }

  @override
  Widget build(BuildContext context) {
    final title = (widget.data['title'] ?? 'Remedy') as String;
    final note = (widget.data['note'] ?? '') as String;
    final astro = (widget.data['astrologerName'] ?? 'Astrologer') as String;
    final photo = widget.data['astrologerPhoto'] as String?;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Your Remedy')),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                  AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, AppSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('This is your remedy',
                      style: AppTypography.headline.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      AppAvatar(name: astro, photoUrl: photo, size: 22),
                      const SizedBox(width: 7),
                      Text('From $astro',
                          style: AppTypography.caption.copyWith(color: AppColors.textSecondary)),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFFF3ECFF), Color(0xFFFFF6E2)],
                      ),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppColors.warning.withValues(alpha: 0.45)),
                      boxShadow: AppShadows.soft,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 34,
                              height: 34,
                              decoration: const BoxDecoration(
                                  gradient: AppColors.primaryGradient, shape: BoxShape.circle),
                              child: const Icon(Icons.self_improvement_rounded,
                                  color: Colors.white, size: 18),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(title,
                                  style: AppTypography.body
                                      .copyWith(fontWeight: FontWeight.w800, fontSize: 16)),
                            ),
                          ],
                        ),
                        if (note.isNotEmpty) ...[
                          const SizedBox(height: 14),
                          Text(note,
                              style: AppTypography.body
                                  .copyWith(height: 1.5, color: AppColors.textDark)),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Row(
                    children: [
                      const Icon(Icons.auto_awesome_rounded,
                          size: 14, color: AppColors.textSecondary),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                            'Follow this with faith and a calm heart. Small, steady steps carry the most blessings.',
                            style: AppTypography.caption
                                .copyWith(color: AppColors.textSecondary, height: 1.4)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, AppSpacing.md),
              child: _followed
                  ? Container(
                      height: 54,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: AppColors.success.withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppColors.success.withValues(alpha: 0.35)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.verified_rounded, size: 18, color: AppColors.success),
                          const SizedBox(width: 8),
                          Text('Blessings received ✨',
                              style: AppTypography.body.copyWith(
                                  color: AppColors.success, fontWeight: FontWeight.w700)),
                        ],
                      ),
                    )
                  : GestureDetector(
                      onTap: _follow,
                      behavior: HitTestBehavior.opaque,
                      child: Container(
                        height: 54,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          gradient: AppColors.primaryGradient,
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: AppShadows.soft,
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.check_circle_rounded, size: 20, color: Colors.white),
                            const SizedBox(width: 8),
                            Text("I understood, I'll follow it",
                                style: AppTypography.body.copyWith(
                                    color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15)),
                          ],
                        ),
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
