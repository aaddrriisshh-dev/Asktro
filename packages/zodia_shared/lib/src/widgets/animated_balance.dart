import 'package:flutter/material.dart';
import '../theme/app_typography.dart';
import '../utils/money.dart';

/// Animated number counter for wallet balance updates (Part 2). Smoothly tweens
/// between the previous and new paise value and formats as ₹.
class AnimatedBalance extends StatelessWidget {
  const AnimatedBalance({
    super.key,
    required this.paise,
    this.style,
    this.precise = false,
    this.duration = const Duration(milliseconds: 650),
  });

  final int paise;
  final TextStyle? style;
  final bool precise;
  final Duration duration;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      // TweenAnimationBuilder animates from the current value to the new `end`
      // whenever `paise` changes across rebuilds; `begin` seeds the first frame.
      tween: Tween(begin: 0, end: paise.toDouble()),
      duration: duration,
      curve: Curves.easeOutCubic,
      builder: (context, value, _) {
        final rounded = value.round();
        return Text(
          precise ? Money.formatPaisePrecise(rounded) : Money.formatPaise(rounded),
          style: style ?? AppTypography.headline,
        );
      },
    );
  }
}
