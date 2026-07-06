import 'package:flutter/material.dart';
import 'package:shared_flutter/shared_flutter.dart';

/// A whisper-quiet celestial backdrop — a few faint zodiac wheels floating
/// behind content so every surface reads as part of the same celestial world.
/// Deliberately minimal (very low opacity) so it never competes with the
/// foreground; drop it behind any screen's body.
class CelestialBackground extends StatelessWidget {
  const CelestialBackground({super.key, required this.child, this.color});

  final Widget child;

  /// Base fill behind the wheels (defaults to the app background).
  final Color? color;

  static const _wheel = 'assets/onboarding/zodiac_wheel.png';

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned.fill(child: ColoredBox(color: color ?? AppColors.background)),
        // Three faint wheels drifting off the corners — the "round things".
        Positioned(
          top: -46,
          right: -54,
          child: IgnorePointer(
            child: Opacity(opacity: 0.06, child: Image.asset(_wheel, width: 200)),
          ),
        ),
        Positioned(
          top: 220,
          left: -66,
          child: IgnorePointer(
            child: Opacity(opacity: 0.045, child: Image.asset(_wheel, width: 168)),
          ),
        ),
        Positioned(
          bottom: -44,
          right: -34,
          child: IgnorePointer(
            child: Opacity(opacity: 0.05, child: Image.asset(_wheel, width: 156)),
          ),
        ),
        Positioned.fill(child: child),
      ],
    );
  }
}
