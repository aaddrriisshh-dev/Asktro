import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

/// A self-contained shimmer loader (no external package). Wrap skeleton blocks
/// to get the sweeping highlight. Used instead of spinners (Part 2).
class Shimmer extends StatefulWidget {
  const Shimmer({super.key, required this.child});
  final Widget child;

  @override
  State<Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<Shimmer> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1300))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        return ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (bounds) {
            final dx = bounds.width * (_c.value * 2 - 1);
            return LinearGradient(
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
              colors: const [
                Color(0xFFFFF3D6),
                Color(0xFFFFFDF7),
                Color(0xFFFFF3D6),
              ],
              stops: const [0.35, 0.5, 0.65],
              transform: _SlideGradient(dx),
            ).createShader(bounds);
          },
          child: child,
        );
      },
      child: widget.child,
    );
  }
}

class _SlideGradient extends GradientTransform {
  const _SlideGradient(this.dx);
  final double dx;
  @override
  Matrix4 transform(Rect bounds, {TextDirection? textDirection}) =>
      Matrix4.translationValues(dx, 0, 0);
}

/// A rounded grey block used as a shimmer placeholder.
class SkeletonBox extends StatelessWidget {
  const SkeletonBox({super.key, this.width, this.height = 16, this.radius = 8});
  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: AppColors.accentLavender,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

/// A ready-made shimmering astrologer-card placeholder for list loading states.
class AstrologerCardSkeleton extends StatelessWidget {
  const AstrologerCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: softCardDecoration(),
        child: const Row(
          children: [
            SkeletonBox(width: 56, height: 56, radius: 28),
            SizedBox(width: AppSpacing.lg),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SkeletonBox(width: 140, height: 16),
                  SizedBox(height: AppSpacing.sm),
                  SkeletonBox(width: 90, height: 12),
                  SizedBox(height: AppSpacing.sm),
                  SkeletonBox(width: 180, height: 12),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
