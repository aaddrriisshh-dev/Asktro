import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import 'consultation_controller.dart';
import '../../app/providers.dart';
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
  int _rating = 0;
  final _review = TextEditingController();
  bool _submitting = false;

  Future<void> _submit() async {
    if (_rating == 0) {
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
          .rate(_rating.toDouble(), review: _review.text.trim().isEmpty ? null : _review.text.trim())
          .timeout(const Duration(seconds: 10));
      ref.read(analyticsProvider).logEvent(AnalyticsEvents.ratingSubmitted, params: {
        'rating': _rating,
        'astrologerId': widget.astrologer.id,
      },);
    } catch (_) {
      // Swallow timeouts/errors — never block the user from leaving.
    } finally {
      _close();
    }
  }

  void _close() {
    if (mounted) context.go('/home');
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
              const SizedBox(height: AppSpacing.xl),
              const Icon(Icons.check_circle_rounded, size: 72, color: AppColors.success),
              const SizedBox(height: AppSpacing.md),
              Text('Consultation complete', style: AppTypography.title),
              const SizedBox(height: AppSpacing.xl),
              AppCard(
                child: Column(
                  children: [
                    _row('Astrologer', widget.astrologer.name),
                    _row('Duration', Money.formatDurationLong(c.duration)),
                    _row('Type', c.type.name),
                    _row('Amount charged', Money.formatPaise(c.totalCharged)),
                    if (c.receiptNo != null) _row('Receipt', c.receiptNo!),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              Text('Rate your experience', style: AppTypography.subtitle),
              const SizedBox(height: AppSpacing.sm),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(5, (i) {
                  final filled = i < _rating;
                  return IconButton(
                    onPressed: () => setState(() => _rating = i + 1),
                    icon: Icon(filled ? Icons.star_rounded : Icons.star_border_rounded,
                        color: AppColors.warning, size: 36,),
                  );
                }),
              ),
              const SizedBox(height: AppSpacing.sm),
              TextField(
                controller: _review,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(hintText: 'Share a few words (optional)'),
              ),
              const SizedBox(height: AppSpacing.xl),
              PrimaryButton(
                label: _rating == 0 ? 'Done' : 'Submit rating',
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
}
