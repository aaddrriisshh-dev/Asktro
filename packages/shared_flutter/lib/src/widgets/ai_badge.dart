import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// Understated "AI" tag for AI-persona astrologers. Deliberately small and
/// low-contrast so a profile reads as a real astrologer at a glance, while the
/// AI nature is still disclosed for anyone who looks.
class AiBadge extends StatelessWidget {
  const AiBadge({super.key, this.compact = false});

  /// compact = tiny inline tag (cards); otherwise a slightly roomier pill.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 5 : 7, vertical: compact ? 1 : 2),
      decoration: BoxDecoration(
        color: AppColors.textSecondary.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        '✦ AI',
        style: TextStyle(
          fontSize: compact ? 9 : 10,
          height: 1.1,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.3,
          color: AppColors.textSecondary,
        ),
      ),
    );
  }
}
