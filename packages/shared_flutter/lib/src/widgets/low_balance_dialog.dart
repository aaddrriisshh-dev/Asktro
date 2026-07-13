import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';
import '../utils/money.dart';
import 'app_buttons.dart';

/// Level 1 low-balance dialog (~2 min remaining). Soft blurred background,
/// rounded glass dialog, polite urgency — never scary (Part 2 / Part 4).
///
/// Returns `true` if the user chose "Recharge Now", `false`/null to continue.
Future<bool?> showLowBalanceDialog(
  BuildContext context, {
  required int remainingSec,
}) {
  return showGeneralDialog<bool>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'low-balance',
    barrierColor: Colors.black.withValues(alpha: 0.25),
    transitionDuration: const Duration(milliseconds: 250),
    pageBuilder: (_, __, ___) => const SizedBox.shrink(),
    transitionBuilder: (context, anim, _, __) {
      final curved = CurvedAnimation(parent: anim, curve: Curves.easeOutBack);
      return BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8 * anim.value, sigmaY: 8 * anim.value),
        child: Opacity(
          opacity: anim.value.clamp(0, 1),
          child: Transform.scale(
            scale: 0.9 + 0.1 * curved.value,
            child: SafeArea(
              child: Center(
                child: _LowBalanceCard(remainingSec: remainingSec),
              ),
            ),
          ),
        ),
      );
    },
  );
}

class _LowBalanceCard extends StatelessWidget {
  const _LowBalanceCard({required this.remainingSec});
  final int remainingSec;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
      child: Material(
        color: Colors.transparent,
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.xl),
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(AppRadius.dialog),
            boxShadow: AppShadows.card,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 84,
                height: 84,
                decoration: const BoxDecoration(
                  gradient: AppColors.lavenderGradient,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.hourglass_bottom_rounded, size: 40, color: AppColors.primary),
              ),
              const SizedBox(height: AppSpacing.lg),
              Text('Almost out of time', style: AppTypography.title, textAlign: TextAlign.center),
              const SizedBox(height: AppSpacing.sm),
              Text(
                "You're almost out of consultation time. Recharge now to continue without interruption.",
                style: AppTypography.caption,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.lg),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
                decoration: BoxDecoration(
                  color: AppColors.accentLavender,
                  borderRadius: BorderRadius.circular(AppRadius.chip),
                ),
                child: Text(
                  'Remaining Time  ${Money.formatDuration(remainingSec)}',
                  style: AppTypography.subtitle.copyWith(color: AppColors.primary),
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              PrimaryButton(
                label: 'Recharge Now',
                icon: Icons.bolt_rounded,
                onPressed: () => Navigator.of(context).pop(true),
              ),
              const SizedBox(height: AppSpacing.sm),
              SecondaryButton(
                label: 'Continue',
                onPressed: () => Navigator.of(context).pop(false),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
