import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../profile_setup/onboarding_style.dart';

/// Animated launch splash: a lavender celestial sky where gold light scatters
/// across the screen, stars twinkle, the zodiac wheel turns faintly, then the
/// Asktro wordmark rises in and the tagline settles beneath it. The router
/// redirect takes over once auth resolves and the minimum splash time elapses.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with TickerProviderStateMixin {
  late final AnimationController _intro =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 2600))..forward();
  late final AnimationController _twinkle =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 2400))..repeat();
  late final AnimationController _spin =
      AnimationController(vsync: this, duration: const Duration(seconds: 70))..repeat();

  // fixed star field (fractional positions + size + phase), kept off the centre
  static final List<List<double>> _stars = _seedStars();
  static List<List<double>> _seedStars() {
    final r = math.Random(7);
    final out = <List<double>>[];
    while (out.length < 20) {
      final x = r.nextDouble(), y = r.nextDouble();
      if ((x - 0.5).abs() < 0.16 && (y - 0.46).abs() < 0.13) continue; // clear the logo
      out.add([x, y, 5 + r.nextDouble() * 11, r.nextDouble()]);
    }
    return out;
  }

  double _iv(double a, double b, [Curve c = Curves.easeOut]) =>
      CurvedAnimation(parent: _intro, curve: Interval(a, b, curve: c)).value;

  @override
  void dispose() {
    _intro.dispose();
    _twinkle.dispose();
    _spin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return Scaffold(
      body: AnimatedBuilder(
        animation: Listenable.merge([_intro, _twinkle, _spin]),
        builder: (context, _) {
          final glow = _iv(0.0, 0.42);
          final wheel = _iv(0.05, 0.48);
          final logo = _iv(0.15, 0.52);
          final tag = _iv(0.42, 0.72);
          final rule = _iv(0.48, 0.74);
          return Container(
            decoration: const BoxDecoration(
              gradient: RadialGradient(
                center: Alignment(0, -0.15),
                radius: 1.1,
                colors: [Color(0xFFFBF9FF), Color(0xFFF5F2FF), Color(0xFFEDE7FB)],
                stops: [0.0, 0.5, 1.0],
              ),
            ),
            child: Stack(
              children: [
                // scattered gold light — several soft blooms across the sky
                _glow(top: -40, left: -30, d: 260, op: 0.34 * glow),
                _glow(top: 90, right: -50, d: 220, op: 0.26 * glow),
                _glow(bottom: 150, left: -36, d: 240, op: 0.24 * glow),
                _glow(bottom: -40, right: 44, d: 210, op: 0.30 * glow),
                // faint rotating zodiac wheel
                Center(
                  child: Transform.rotate(
                    angle: _spin.value * 2 * math.pi,
                    child: Opacity(
                      opacity: 0.11 * wheel,
                      child: Image.asset(Ob.zodiacWheel, width: size.width * 1.15),
                    ),
                  ),
                ),
                // twinkling stars
                ..._stars.map((s) {
                  final tw = 0.5 + 0.5 * math.sin(2 * math.pi * (_twinkle.value + s[3]));
                  return Positioned(
                    left: s[0] * size.width,
                    top: s[1] * size.height,
                    child: Opacity(
                      opacity: (0.15 + 0.85 * tw) * glow,
                      child: Icon(Icons.auto_awesome, color: const Color(0xFFEAD079), size: s[2]),
                    ),
                  );
                }),
                // brand
                Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Opacity(
                        opacity: logo,
                        child: Transform.translate(
                          offset: Offset(0, 16 * (1 - logo)),
                          child: Transform.scale(
                            scale: 0.9 + 0.1 * logo,
                            child: Image.asset(Ob.logoWordmark, width: math.min(size.width * 0.64, 300)),
                          ),
                        ),
                      ),
                      const SizedBox(height: 22),
                      Opacity(
                        opacity: tag,
                        child: Transform.translate(
                          offset: Offset(0, 10 * (1 - tag)),
                          // Constrain to screen width and scale-to-fit so the
                          // letter-spaced tagline + side rules never overflow
                          // horizontally on narrow devices.
                          child: SizedBox(
                            width: size.width,
                            child: FittedBox(
                              fit: BoxFit.scaleDown,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 20),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    _rule(rule, false),
                                    const Padding(
                                      padding: EdgeInsets.symmetric(horizontal: 8),
                                      child: Icon(Icons.auto_awesome, color: Color(0xFFC99A2E), size: 12),
                                    ),
                                    Text(
                                      'GUIDANCE WRITTEN IN THE STARS',
                                      style: GoogleFonts.cormorantGaramond(
                                        fontSize: 15,
                                        fontWeight: FontWeight.w600,
                                        letterSpacing: 2.6,
                                        color: const Color(0xFF4B2A80),
                                      ),
                                    ),
                                    const Padding(
                                      padding: EdgeInsets.symmetric(horizontal: 8),
                                      child: Icon(Icons.auto_awesome, color: Color(0xFFC99A2E), size: 12),
                                    ),
                                    _rule(rule, true),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _glow({double? top, double? right, double? bottom, double? left, required double d, required double op}) {
    return Positioned(
      top: top,
      right: right,
      bottom: bottom,
      left: left,
      child: IgnorePointer(
        child: Container(
          width: d,
          height: d,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              colors: [
                const Color(0xFFEAD079).withValues(alpha: op),
                const Color(0xFFEAD079).withValues(alpha: op * 0.28),
                const Color(0x00EAD079),
              ],
              stops: const [0.0, 0.5, 1.0],
            ),
          ),
        ),
      ),
    );
  }

  Widget _rule(double t, bool reversed) {
    return Container(
      width: 40 * t,
      height: 1.4,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: reversed ? Alignment.centerLeft : Alignment.centerRight,
          end: reversed ? Alignment.centerRight : Alignment.centerLeft,
          colors: const [Color(0xFFC99A2E), Color(0x00C99A2E)],
        ),
      ),
    );
  }
}
