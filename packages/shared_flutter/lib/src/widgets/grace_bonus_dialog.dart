import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';
import 'app_buttons.dart';

/// Celebratory popup shown when the customer's balance runs out mid-session and
/// the platform gifts a one-time grace minute (Part 4). Warm, delightful — the
/// opposite of the low-balance nudge.
Future<void> showGraceBonusDialog(
  BuildContext context, {
  required int minutes,
}) {
  return showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'grace-bonus',
    barrierColor: Colors.black.withValues(alpha: 0.25),
    transitionDuration: const Duration(milliseconds: 280),
    pageBuilder: (_, __, ___) => const SizedBox.shrink(),
    transitionBuilder: (context, anim, _, __) {
      final curved = CurvedAnimation(parent: anim, curve: Curves.easeOutBack);
      return BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8 * anim.value, sigmaY: 8 * anim.value),
        child: Opacity(
          opacity: anim.value.clamp(0, 1),
          child: Transform.scale(
            scale: 0.9 + 0.1 * curved.value,
            child: Center(child: _GraceCard(minutes: minutes)),
          ),
        ),
      );
    },
  );
}

class _GraceCard extends StatelessWidget {
  const _GraceCard({required this.minutes});
  final int minutes;

  @override
  Widget build(BuildContext context) {
    final label = minutes == 1 ? '1 extra minute' : '$minutes extra minutes';
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
                  gradient: AppColors.primaryGradient,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.card_giftcard_rounded, size: 40, color: Colors.white),
              ),
              const SizedBox(height: AppSpacing.lg),
              Text('On the house 🎁', style: AppTypography.title, textAlign: TextAlign.center),
              const SizedBox(height: AppSpacing.sm),
              Text(
                '$label has been added to your wallet so your conversation keeps flowing. Recharge to continue after this.',
                style: AppTypography.caption,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.xl),
              PrimaryButton(
                label: 'Keep chatting',
                icon: Icons.favorite_rounded,
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
