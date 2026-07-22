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

  static const _wheel = 'assets/onboarding/zodiac_wheel.webp';

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

/// A whisper-quiet celestial dot grid behind content — evenly spaced, faintly
/// purple dots that read as gentle "paper" texture without competing with the
/// foreground. Used behind the chat thread.
class DotGridBackground extends StatelessWidget {
  const DotGridBackground({super.key, required this.child, this.color});

  final Widget child;

  /// Base fill behind the dots (defaults to the app background).
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(color: color ?? AppColors.background),
      child: CustomPaint(
        painter: _DotGridPainter(),
        child: child,
      ),
    );
  }
}

class _DotGridPainter extends CustomPainter {
  static const double _gap = 20;
  static const double _radius = 1.3;
  final Paint _dot = Paint()..color = const Color(0x1A7E57C2); // ~10% purple

  @override
  void paint(Canvas canvas, Size size) {
    for (double y = _gap / 2; y < size.height; y += _gap) {
      for (double x = _gap / 2; x < size.width; x += _gap) {
        canvas.drawCircle(Offset(x, y), _radius, _dot);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DotGridPainter oldDelegate) => false;
}
