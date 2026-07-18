import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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

/// Live view of a single remedy — the detail screen watches this so the
/// astrologer's reply appears the moment it lands.
final _remedyDocProvider =
    StreamProvider.autoDispose.family<Map<String, dynamic>, String>((ref, id) {
  return ref.watch(firestoreProvider).collection('remedies').doc(id).snapshots().map((d) {
    final data = d.data() ?? const <String, dynamic>{};
    return {'id': d.id, ...data};
  });
});

/// The nurture-thread messages on a remedy (astrologer <-> customer), oldest
/// first — the ongoing conversation for an AI astrologer's remedy.
final _remedyThreadProvider =
    StreamProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, id) {
  return ref
      .watch(firestoreProvider)
      .collection('remedies')
      .doc(id)
      .collection('thread')
      .orderBy('createdAt')
      .snapshots()
      .map((s) => s.docs.map((d) => {'id': d.id, ...d.data()}).toList());
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
    final answered = widget.data['answered'] == true;
    final awaiting = !answered && widget.data['followUpUsed'] == true;

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
              if (answered) const _StatusPill(label: 'Reply received', color: AppColors.success),
              if (awaiting) const _StatusPill(label: 'Awaiting reply', color: AppColors.warning),
            ],
          ),
          if (note.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(note,
                style: AppTypography.body.copyWith(height: 1.35),
                maxLines: 3,
                overflow: TextOverflow.ellipsis,),
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
                                color: AppColors.primary, fontWeight: FontWeight.w700, fontSize: 13.5,),),
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
                                    color: AppColors.success, fontWeight: FontWeight.w700, fontSize: 13.5,),),
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
                                  color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12.5,),
                              maxLines: 1, overflow: TextOverflow.ellipsis,),
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

/// A small rounded status chip (e.g. "Reply received" / "Awaiting reply").
class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(label,
          style: AppTypography.caption.copyWith(
              color: color, fontWeight: FontWeight.w700, fontSize: 11,),),
    );
  }
}

/// A calm, full-screen reading view for a single remedy — the whole text,
/// scrollable, inside a celestial lavender→gold box (the same palette as the
/// remedy card that appears in a live chat), with a gentle affirming CTA and a
/// one-free follow-up question routed to the astrologer who wrote it.
class RemedyDetailScreen extends ConsumerStatefulWidget {
  const RemedyDetailScreen({required this.data, super.key});
  final Map<String, dynamic> data;

  @override
  ConsumerState<RemedyDetailScreen> createState() => _RemedyDetailScreenState();
}

class _RemedyDetailScreenState extends ConsumerState<RemedyDetailScreen> {
  bool _followed = false;
  bool _sending = false;

  void _follow() {
    HapticFeedback.mediumImpact();
    setState(() => _followed = true);
  }

  Future<void> _askQuestion(String remedyId, String astro) async {
    final ctrl = TextEditingController();
    final text = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
            left: 20, right: 20, top: 18, bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Ask $astro', style: AppTypography.body.copyWith(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 4),
            Text('Your first follow-up on this remedy is free.',
                style: AppTypography.caption.copyWith(color: AppColors.textSecondary),),
            const SizedBox(height: 14),
            TextField(
              controller: ctrl,
              autofocus: true,
              minLines: 2,
              maxLines: 5,
              maxLength: 600,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                hintText: 'e.g. Should I do this in the morning or at night?',
                filled: true,
                fillColor: AppColors.background,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none,),
                contentPadding: const EdgeInsets.all(14),
              ),
            ),
            const SizedBox(height: 6),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
                child: const Text('Send question'),
              ),
            ),
          ],
        ),
      ),
    );
    if (text == null || text.isEmpty || !mounted) return;

    setState(() => _sending = true);
    try {
      await ref
          .read(functionsProvider)
          .httpsCallable('askRemedyQuestion')
          .call<Map<String, dynamic>>({'remedyId': remedyId, 'question': text});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Sent to $astro. We\'ll notify you when they reply.')),
        );
      }
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message ?? 'Could not send your question. Please try again.')),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final id = (widget.data['id'] ?? '') as String;
    // Merge the initial snapshot with the live doc so a reply appears instantly.
    final live = id.isEmpty ? widget.data : (ref.watch(_remedyDocProvider(id)).valueOrNull ?? widget.data);

    final title = (live['title'] ?? 'Remedy') as String;
    final note = (live['note'] ?? '') as String;
    final astro = (live['astrologerName'] ?? 'Astrologer') as String;
    final photo = live['astrologerPhoto'] as String?;
    final astrologerId = (live['astrologerId'] ?? '') as String;
    final question = (live['question'] ?? '') as String;
    final answer = (live['answer'] ?? '') as String;
    final asked = live['followUpUsed'] == true && question.isNotEmpty;
    final answered = live['answered'] == true && answer.isNotEmpty;
    final isAI = live['isAI'] == true; // AI remedies use the free nurture thread

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Your Remedy')),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, AppSpacing.lg,),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('This is your remedy',
                      style: AppTypography.headline.copyWith(fontWeight: FontWeight.w800),),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      AppAvatar(name: astro, photoUrl: photo, size: 22),
                      const SizedBox(width: 7),
                      Text('From $astro',
                          style: AppTypography.caption.copyWith(color: AppColors.textSecondary),),
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
                                  gradient: AppColors.primaryGradient, shape: BoxShape.circle,),
                              child: const Icon(Icons.self_improvement_rounded,
                                  color: Colors.white, size: 18,),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(title,
                                  style: AppTypography.body
                                      .copyWith(fontWeight: FontWeight.w800, fontSize: 16),),
                            ),
                          ],
                        ),
                        if (note.isNotEmpty) ...[
                          const SizedBox(height: 14),
                          Text(note,
                              style: AppTypography.body
                                  .copyWith(height: 1.5, color: AppColors.textDark),),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Row(
                    children: [
                      const Icon(Icons.auto_awesome_rounded,
                          size: 14, color: AppColors.textSecondary,),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                            'Follow this with faith and a calm heart. Small, steady steps carry the most blessings.',
                            style: AppTypography.caption
                                .copyWith(color: AppColors.textSecondary, height: 1.4),),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  // AI astrologer → a free ongoing thread (she may reach out with
                  // guidance + suggestions). Human astrologer → the one-free-follow-up.
                  if (isAI)
                    _RemedyThreadView(remedyId: id, astro: astro)
                  else
                    _followUpSection(
                      remedyId: id,
                      astro: astro,
                      astrologerId: astrologerId,
                      question: question,
                      answer: answer,
                      asked: asked,
                      answered: answered,
                    ),
                ],
              ),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, AppSpacing.md,),
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
                                  color: AppColors.success, fontWeight: FontWeight.w700,),),
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
                                    color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15,),),
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

  /// The follow-up thread: ask (once, free) → waiting → the astrologer's reply.
  Widget _followUpSection({
    required String remedyId,
    required String astro,
    required String astrologerId,
    required String question,
    required String answer,
    required bool asked,
    required bool answered,
  }) {
    // Nothing asked yet — offer the one free follow-up.
    if (!asked) {
      return GestureDetector(
        onTap: _sending || remedyId.isEmpty ? null : () => _askQuestion(remedyId, astro),
        behavior: HitTestBehavior.opaque,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.primary.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.primary.withValues(alpha: 0.30)),
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(11),),
                child: Icon(_sending ? Icons.hourglass_top_rounded : Icons.help_outline_rounded,
                    color: AppColors.primary, size: 20,),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Have a question about this remedy?',
                        style: AppTypography.body.copyWith(fontWeight: FontWeight.w700),),
                    const SizedBox(height: 2),
                    Text('Ask $astro · your first follow-up is free',
                        style: AppTypography.caption.copyWith(color: AppColors.textSecondary),),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.primary),
            ],
          ),
        ),
      );
    }

    // Asked — show the thread (question, then reply or a waiting state).
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.forum_rounded, size: 15, color: AppColors.primary),
            const SizedBox(width: 6),
            Text('Your follow-up',
                style: AppTypography.caption.copyWith(
                    color: AppColors.textSecondary, fontWeight: FontWeight.w700,),),
            const Spacer(),
            if (answered)
              const _StatusPill(label: 'Reply received', color: AppColors.success)
            else
              const _StatusPill(label: 'Awaiting reply', color: AppColors.warning),
          ],
        ),
        const SizedBox(height: 8),
        // The customer's question bubble.
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(13),
          decoration: BoxDecoration(
            color: AppColors.primary.withValues(alpha: 0.08),
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(14),
              topRight: Radius.circular(14),
              bottomRight: Radius.circular(14),
              bottomLeft: Radius.circular(4),
            ),
          ),
          child: Text(question, style: AppTypography.body.copyWith(height: 1.4)),
        ),
        const SizedBox(height: 10),
        if (answered) ...[
          Row(
            children: [
              AppAvatar(name: astro, size: 20),
              const SizedBox(width: 7),
              Text(astro,
                  style: AppTypography.caption.copyWith(fontWeight: FontWeight.w700),),
            ],
          ),
          const SizedBox(height: 6),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFFFF6E2), Color(0xFFF3ECFF)],
              ),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(4),
                topRight: Radius.circular(14),
                bottomRight: Radius.circular(14),
                bottomLeft: Radius.circular(14),
              ),
              border: Border.all(color: AppColors.warning.withValues(alpha: 0.40)),
            ),
            child: Text(answer,
                style: AppTypography.body.copyWith(height: 1.5, color: AppColors.textDark),),
          ),
          const SizedBox(height: 12),
          // The one free follow-up is spent — further questions go to a paid chat.
          GestureDetector(
            onTap: astrologerId.isEmpty ? null : () => context.push('/astrologer/$astrologerId'),
            behavior: HitTestBehavior.opaque,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.only(top: 1),
                  child: Icon(Icons.chat_bubble_outline_rounded, size: 15, color: AppColors.primary),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text('Need more guidance? Chat with $astro',
                      style: AppTypography.caption.copyWith(
                          color: AppColors.primary, fontWeight: FontWeight.w700, height: 1.3,),),
                ),
              ],
            ),
          ),
        ] else
          Row(
            children: [
              const Icon(Icons.schedule_rounded, size: 15, color: AppColors.warning),
              const SizedBox(width: 8),
              Expanded(
                child: Text('Waiting for $astro to reply — we\'ll notify you.',
                    style: AppTypography.caption.copyWith(color: AppColors.textSecondary),),
              ),
            ],
          ),
      ],
    );
  }
}

/// The free nurture thread for an AI astrologer's remedy: the conversation the
/// astrologer (run from the portal) has with the customer — messages, optional
/// tappable product hooks (deep-link to the store), a reply box, and the
/// compliance opt-out.
class _RemedyThreadView extends ConsumerStatefulWidget {
  const _RemedyThreadView({required this.remedyId, required this.astro});
  final String remedyId;
  final String astro;

  @override
  ConsumerState<_RemedyThreadView> createState() => _RemedyThreadViewState();
}

class _RemedyThreadViewState extends ConsumerState<_RemedyThreadView> {
  final _input = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _reply() async {
    final t = _input.text.trim();
    if (t.isEmpty) return;
    setState(() => _sending = true);
    try {
      await ref
          .read(functionsProvider)
          .httpsCallable('replyToRemedyThread')
          .call<Map<String, dynamic>>({'remedyId': widget.remedyId, 'text': t});
      _input.clear();
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message ?? 'Could not send. Please try again.')));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _stopMessages() async {
    try {
      await ref
          .read(functionsProvider)
          .httpsCallable('setRemedyMessagesOptOut')
          .call<Map<String, dynamic>>({'optOut': true});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("You won't receive astrologer messages anymore.")),
        );
      }
    } catch (_) {/* best-effort */}
  }

  @override
  Widget build(BuildContext context) {
    final msgs = ref.watch(_remedyThreadProvider(widget.remedyId)).valueOrNull ?? const [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.forum_rounded, size: 15, color: AppColors.primary),
            const SizedBox(width: 6),
            Text('Chat with ${widget.astro}',
                style: AppTypography.caption
                    .copyWith(color: AppColors.textSecondary, fontWeight: FontWeight.w700),),
          ],
        ),
        const SizedBox(height: 8),
        if (msgs.isEmpty)
          Text('${widget.astro} may message you here with guidance. You can reply anytime.',
              style: AppTypography.caption.copyWith(color: AppColors.textSecondary),)
        else
          ...msgs.map((m) => _bubble(context, m)),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _input,
                minLines: 1,
                maxLines: 4,
                maxLength: 600,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(
                  hintText: 'Message ${widget.astro}…',
                  counterText: '',
                  filled: true,
                  fillColor: AppColors.card,
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none,),
                  contentPadding: const EdgeInsets.all(12),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton(
              onPressed: _sending ? null : _reply,
              icon: const Icon(Icons.send_rounded, color: AppColors.primary),
            ),
          ],
        ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            onPressed: _stopMessages,
            child: Text('Stop messages from astrologers',
                style: AppTypography.caption.copyWith(color: AppColors.textSecondary),),
          ),
        ),
      ],
    );
  }

  Widget _bubble(BuildContext context, Map<String, dynamic> m) {
    final mine = m['senderRole'] != 'astrologer';
    final text = (m['text'] ?? '') as String;
    final hook = m['hook'] as Map<String, dynamic>?;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.all(12),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
        decoration: BoxDecoration(
          gradient: mine
              ? null
              : const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFFF3ECFF), Color(0xFFFFF6E2)],
                ),
          color: mine ? AppColors.primary.withValues(alpha: 0.10) : null,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
              color: mine
                  ? AppColors.primary.withValues(alpha: 0.25)
                  : AppColors.warning.withValues(alpha: 0.35),),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(text, style: AppTypography.body.copyWith(height: 1.4)),
            if (hook != null && hook['productId'] != null) ...[
              const SizedBox(height: 8),
              _hookCard(context, hook),
            ],
          ],
        ),
      ),
    );
  }

  Widget _hookCard(BuildContext context, Map<String, dynamic> hook) {
    final title = (hook['title'] ?? 'Product') as String;
    final cta = (hook['cta'] ?? 'View in store') as String;
    final productId = (hook['productId'] ?? '') as String;
    return GestureDetector(
      onTap: productId.isEmpty ? null : () => context.push('/store/product/$productId'),
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.7),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
        ),
        child: Row(
          children: [
            const Icon(Icons.shopping_bag_rounded, size: 18, color: AppColors.primary),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: AppTypography.body.copyWith(fontWeight: FontWeight.w700, fontSize: 13.5),),
                  Text(cta,
                      style: AppTypography.caption
                          .copyWith(color: AppColors.primary, fontWeight: FontWeight.w700),),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: AppColors.primary),
          ],
        ),
      ),
    );
  }
}
