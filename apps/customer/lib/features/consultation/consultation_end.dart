import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import 'consultation_controller.dart';
import '../../app/providers.dart';
import '../../app/feature_flags.dart';
import '../../data/messaging_service.dart';

/// Full-screen session summary + rating (Part 3/4). Pushed after a consultation
/// ends; returns the user to home.
Future<void> showConsultationEnd(
  BuildContext context,
  WidgetRef ref, {
  required Consultation consultation,
  required Astrologer astrologer,
}) {
  return Navigator.of(context).push(MaterialPageRoute(
    fullscreenDialog: true,
    builder: (_) => _ConsultationEndScreen(consultation: consultation, astrologer: astrologer),
  ),);
}

class _ConsultationEndScreen extends ConsumerStatefulWidget {
  const _ConsultationEndScreen({required this.consultation, required this.astrologer});
  final Consultation consultation;
  final Astrologer astrologer;

  @override
  ConsumerState<_ConsultationEndScreen> createState() => _ConsultationEndScreenState();
}

class _ConsultationEndScreenState extends ConsumerState<_ConsultationEndScreen> {
  int _behavior = 0;
  int _accuracy = 0;
  int _overall = 0;
  final _review = TextEditingController();
  bool _submitting = false;

  Future<void> _submit() async {
    // Overall is the headline score (drives the astrologer's average); the other
    // two are captured as a breakdown. If they gave no overall, just leave.
    if (_overall == 0) {
      _close();
      return;
    }
    setState(() => _submitting = true);
    // Rating is best-effort: the session already ended and billing is settled.
    // Cap the wait so a slow network can't strand the user on a spinner (the
    // callable's own timeout is 120s), and always return home afterwards. The
    // rating may still land server-side even if we stop waiting.
    try {
      await ref
          .read(consultationControllerProvider(widget.consultation.id).notifier)
          .rate(
            _overall.toDouble(),
            review: _review.text.trim().isEmpty ? null : _review.text.trim(),
            behaviorRating: _behavior > 0 ? _behavior.toDouble() : null,
            accuracyRating: _accuracy > 0 ? _accuracy.toDouble() : null,
          )
          .timeout(const Duration(seconds: 10));
      ref.read(analyticsProvider).logEvent(AnalyticsEvents.ratingSubmitted, params: {
        'rating': _overall,
        'astrologerId': widget.astrologer.id,
      },);
    } catch (_) {
      // Swallow timeouts/errors — never block the user from leaving.
    } finally {
      _close();
    }
  }

  void _close() {
    if (!mounted) return;
    // This screen (and the chat/profile beneath it) were pushed imperatively,
    // so pop the whole stack back to the shell — go('/home') alone doesn't
    // reliably remove pushed routes, which left the user stuck on the spinner.
    final nav = Navigator.of(context);
    if (nav.canPop()) {
      nav.popUntil((route) => route.isFirst);
    } else {
      context.go('/home');
    }
  }

  @override
  void dispose() {
    _review.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.consultation;
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            children: [
              const SizedBox(height: AppSpacing.md),
              const Icon(Icons.check_circle_rounded, size: 56, color: AppColors.success),
              const SizedBox(height: AppSpacing.sm),
              Text('Consultation complete', style: AppTypography.title),
              const SizedBox(height: AppSpacing.lg),
              AppCard(
                child: Column(
                  children: [
                    _row('Astrologer', widget.astrologer.name),
                    _row('Duration', Money.formatDurationLong(c.duration)),
                    _row('Type', c.type.name),
                    // Charge/receipt only for PAID (human) consults — AI is free.
                    if (kMonetizationEnabled && !widget.astrologer.isAI)
                      _row('Amount charged', Money.formatPaise(c.totalCharged)),
                    if (kMonetizationEnabled && !widget.astrologer.isAI && c.receiptNo != null)
                      _row('Receipt', c.receiptNo!),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              Text('Rate your experience', style: AppTypography.subtitle),
              const SizedBox(height: AppSpacing.sm),
              Container(
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.border),
                  boxShadow: AppShadows.soft,
                ),
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Column(
                  children: [
                    _ratingRow('Behaviour & politeness', _behavior, (v) => setState(() => _behavior = v)),
                    Divider(height: 1, color: AppColors.border.withValues(alpha: 0.6)),
                    _ratingRow('Accuracy & prediction', _accuracy, (v) => setState(() => _accuracy = v)),
                    Divider(height: 1, color: AppColors.border.withValues(alpha: 0.6)),
                    _ratingRow('Overall experience', _overall, (v) => setState(() => _overall = v)),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              TextField(
                controller: _review,
                minLines: 1,
                maxLines: 3,
                decoration: const InputDecoration(hintText: 'Share a few words (optional)'),
              ),
              const SizedBox(height: AppSpacing.lg),
              PrimaryButton(
                label: _overall == 0 ? 'Done' : 'Submit rating',
                loading: _submitting,
                onPressed: _submitting ? null : _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _row(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(k, style: AppTypography.caption),
            Flexible(child: Text(v, style: AppTypography.body, overflow: TextOverflow.ellipsis)),
          ],
        ),
      );

  /// One labelled 5-star row. Compact (tap targets ~32px) so three of them plus
  /// a review still fit the viewport without scrolling.
  Widget _ratingRow(String label, int value, ValueChanged<int> onChanged) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(
          children: [
            Expanded(child: Text(label, style: AppTypography.body)),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(5, (i) {
                final filled = i < value;
                return GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onChanged(i + 1),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
                    child: Icon(filled ? Icons.star_rounded : Icons.star_border_rounded,
                        color: AppColors.warning, size: 28,),
                  ),
                );
              }),
            ),
          ],
        ),
      );
}
