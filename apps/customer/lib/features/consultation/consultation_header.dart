import 'package:flutter/material.dart';
import 'package:shared_flutter/shared_flutter.dart';

/// Sticky consultation header: astrologer identity + backend-driven remaining
/// time + a recharge shortcut. Colour shifts as the warn level rises.
class ConsultationHeader extends StatelessWidget {
  const ConsultationHeader({
    super.key,
    required this.astrologerName,
    required this.photoUrl,
    required this.verified,
    required this.remainingSec,
    required this.warnLevel,
    required this.onRecharge,
  });

  final String astrologerName;
  final String? photoUrl;
  final bool verified;
  final int remainingSec;
  final int warnLevel;
  final VoidCallback onRecharge;

  Color get _timerColor => switch (warnLevel) {
        >= 2 => AppColors.error,
        1 => AppColors.warning,
        _ => AppColors.primary,
      };

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      decoration: const BoxDecoration(color: AppColors.card, boxShadow: AppShadows.soft),
      child: SafeArea(
        bottom: false,
        child: Row(
          children: [
            AppAvatar(name: astrologerName, photoUrl: photoUrl, size: 40),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Row(
                children: [
                  Flexible(
                    child: Text(astrologerName,
                        style: AppTypography.body.copyWith(fontWeight: FontWeight.w600),
                        overflow: TextOverflow.ellipsis,),
                  ),
                  if (verified) ...[const SizedBox(width: 4), const VerifiedBadge(size: 14)],
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 6),
              decoration: BoxDecoration(
                color: _timerColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(AppRadius.chip),
              ),
              child: Row(
                children: [
                  Icon(Icons.timer_outlined, size: 16, color: _timerColor),
                  const SizedBox(width: 4),
                  Text(Money.formatDuration(remainingSec),
                      style: AppTypography.body.copyWith(color: _timerColor, fontWeight: FontWeight.w700),),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            IconButton(
              onPressed: onRecharge,
              icon: const Icon(Icons.add_circle, color: AppColors.primary),
              tooltip: 'Recharge',
            ),
          ],
        ),
      ),
    );
  }
}
