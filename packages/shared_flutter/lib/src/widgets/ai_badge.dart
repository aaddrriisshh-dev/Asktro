import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// Clear "AI" disclosure tag for AI-persona astrologers. A readable, high-contrast
/// chip (robot glyph + bold "AI") so an AI astrologer is never mistaken for a real
/// human — Google Play's deception policy. Compact, but unmistakable.
class AiBadge extends StatelessWidget {
  const AiBadge({super.key, this.compact = false});

  /// compact = tiny inline tag (cards); otherwise a slightly roomier pill.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 6 : 8, vertical: compact ? 2 : 3),
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.smart_toy_rounded, size: compact ? 10 : 12, color: Colors.white),
          SizedBox(width: compact ? 3 : 4),
          Text(
            'AI',
            style: TextStyle(
              fontSize: compact ? 10 : 11.5,
              height: 1.1,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.5,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}
