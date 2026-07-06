import 'package:flutter/material.dart';
import 'package:shared_flutter/shared_flutter.dart';

/// Sticky consultation header: back, astrologer identity, backend-driven
/// remaining time, a recharge shortcut, and a clear End action. Colour shifts as
/// the warn level rises. Back just leaves the chat (session keeps running and is
/// resumable from Consultations); End explicitly closes and bills the session.
class ConsultationHeader extends StatelessWidget {
  const ConsultationHeader({
    super.key,
    required this.astrologerName,
    required this.photoUrl,
    required this.verified,
    required this.remainingSec,
    required this.warnLevel,
    required this.onRecharge,
    required this.onBack,
    required this.onEnd,
  });

  final String astrologerName;
  final String? photoUrl;
  final bool verified;
  final int remainingSec;
  final int warnLevel;
  final VoidCallback onRecharge;
  final VoidCallback onBack;
  final VoidCallback onEnd;

  Color get _timerColor => switch (warnLevel) {
        >= 2 => AppColors.error,
        1 => AppColors.warning,
        _ => AppColors.primary,
      };

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: AppColors.card, boxShadow: AppShadows.soft),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(4, 8, 10, 10),
          child: Row(
            children: [
              IconButton(
                onPressed: onBack,
                icon: const Icon(Icons.arrow_back_rounded, color: AppColors.textDark),
                tooltip: 'Back',
                visualDensity: VisualDensity.compact,
              ),
              AppAvatar(name: astrologerName, photoUrl: photoUrl, size: 36),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Row(
                  children: [
                    Flexible(
                      child: Text(astrologerName,
                          style: AppTypography.body.copyWith(fontWeight: FontWeight.w700),
                          overflow: TextOverflow.ellipsis,),
                    ),
                    if (verified) ...[const SizedBox(width: 4), const VerifiedBadge(size: 13)],
                  ],
                ),
              ),
              const SizedBox(width: 6),
              // Remaining time — tap to recharge.
              GestureDetector(
                onTap: onRecharge,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: _timerColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(AppRadius.chip),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.timer_outlined, size: 15, color: _timerColor),
                      const SizedBox(width: 4),
                      Text(Money.formatDuration(remainingSec),
                          style: AppTypography.caption.copyWith(color: _timerColor, fontWeight: FontWeight.w700),),
                      const SizedBox(width: 3),
                      Icon(Icons.add_circle, size: 15, color: _timerColor),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 6),
              // Explicit End action.
              GestureDetector(
                onTap: onEnd,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: AppColors.error.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(AppRadius.chip),
                  ),
                  child: Text('End',
                      style: AppTypography.caption.copyWith(color: AppColors.error, fontWeight: FontWeight.w800),),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
