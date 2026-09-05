import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';

/// Small GREEN verified checkmark chip (a green circle with a white tick) — the
/// trust mark on Asktro Verified (human) astrologers.
class VerifiedBadge extends StatelessWidget {
  const VerifiedBadge({super.key, this.size = 16});
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
      child: Icon(Icons.check, size: size * 0.7, color: Colors.white),
    );
  }
}

/// Presence dot (online/offline) with a soft ring.
class PresenceDot extends StatelessWidget {
  const PresenceDot({super.key, required this.online, this.size = 12});
  final bool online;
  final double size;

  @override
  Widget build(BuildContext context) {
    final color = online ? AppColors.online : AppColors.offline;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2),
      ),
    );
  }
}

/// Pill label used for "Popular", "Recommended", offer badges, etc.
class LabelBadge extends StatelessWidget {
  const LabelBadge({
    super.key,
    required this.text,
    this.color = AppColors.primary,
    this.filled = true,
  });

  final String text;
  final Color color;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 3),
      decoration: BoxDecoration(
        color: filled ? color : color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadius.chip),
      ),
      child: Text(
        text,
        style: AppTypography.caption.copyWith(
          color: filled ? Colors.white : color,
          fontWeight: FontWeight.w600,
          fontSize: 12,
        ),
      ),
    );
  }
}

/// Expertise/language chip.
class TagChip extends StatelessWidget {
  const TagChip(this.label, {super.key});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
      decoration: BoxDecoration(
        color: AppColors.accentLavender,
        borderRadius: BorderRadius.circular(AppRadius.chip),
      ),
      child: Text(label, style: AppTypography.caption.copyWith(color: AppColors.primary)),
    );
  }
}
