import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

/// The ZODIA brand wordmark (navy "Zodia" + gold ".in" + tagline), served
/// from the shared package so every app renders the same asset. Falls back to
/// a styled text lockup if the image asset is ever missing, so screens never
/// break during a logo swap.
///
/// Replace `packages/shared_flutter/assets/brand/asktro_logo.png` with the
/// official high-res PNG to update it everywhere at once.
class AppLogo extends StatelessWidget {
  const AppLogo({super.key, this.height = 44});

  /// Rendered height in logical pixels; width scales to the wordmark's ratio.
  final double height;

  static const _asset = 'assets/brand/asktro_logo.png';

  @override
  Widget build(BuildContext context) {
    // Zodia demo: render the styled text lockup (no baked-in wordmark image).
    return _TextFallback(height: height);
  }
}

class _TextFallback extends StatelessWidget {
  const _TextFallback({required this.height});
  final double height;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        RichText(
          text: TextSpan(
            style: AppTypography.headline.copyWith(
              fontSize: height * 0.72,
              color: const Color(0xFF0E1A3A),
              fontWeight: FontWeight.w700,
            ),
            children: [
              const TextSpan(text: 'Zodia'),
              TextSpan(
                text: '.in',
                style: TextStyle(
                    color: const Color(0xFFBFC6D2), fontSize: height * 0.42,),
              ),
            ],
          ),
        ),
        Text(
          'GUIDANCE WRITTEN IN THE STARS',
          style: AppTypography.caption.copyWith(
            fontSize: height * 0.14,
            letterSpacing: height * 0.06,
            color: AppColors.textDark,
          ),
        ),
      ],
    );
  }
}
