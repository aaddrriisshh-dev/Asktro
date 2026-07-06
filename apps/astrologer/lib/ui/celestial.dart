import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Asktro Astrologer — the premium celestial design system.
///
/// A calm, Apple-inspired language: soft-white grounds, lavender surfaces,
/// metallic-gold accents and a deep-purple celestial hero. Everything an
/// astrologer touches all day should feel light, quiet and expensive — closer
/// to a private-banking app than an astrology marketplace.
class Sky {
  Sky._();

  // ---- palette ----
  static const Color bg = Color(0xFFF5F3FB); // soft lavender-white ground
  static const Color surface = Color(0xFFF1EEFA); // faint lavender wash
  static const Color card = Color(0xFFFFFFFF);
  static const Color line = Color(0xFFEDEAF6);

  static const Color ink = Color(0xFF2A2740); // deep navy text
  static const Color ink2 = Color(0xFF8B889E); // muted grey
  static const Color ink3 = Color(0xFFB7B4C8); // faint

  static const Color purple = Color(0xFF6E4BE6); // vibrant brand purple
  static const Color purpleDeep = Color(0xFF3A2A6E);

  static const Color gold = Color(0xFFC9A227);
  static const Color goldSoft = Color(0xFFEAD79A);

  static const Color green = Color(0xFF2FB170);
  static const Color amber = Color(0xFFE0A03A);
  static const Color red = Color(0xFFE5484D);

  // ---- gradients ----
  static const LinearGradient goldGrad = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFF4E3A1), Color(0xFFC9A227)],
  );
  static const LinearGradient heroGrad = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF7E57C2), Color(0xFF5E3FBE), Color(0xFF3A2A6E)],
  );
  static const LinearGradient lavGrad = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFFEFE9FF), Color(0xFFFBFAFF)],
  );

  // ---- elevation ----
  static const List<BoxShadow> soft = [
    BoxShadow(color: Color(0x0F5B3FB0), blurRadius: 18, offset: Offset(0, 8)),
  ];
  static const List<BoxShadow> lift = [
    BoxShadow(color: Color(0x1A5B3FB0), blurRadius: 26, offset: Offset(0, 12)),
  ];

  // ---- type ----
  static const String _f = '.SF Pro Display';
  static TextStyle get display =>
      const TextStyle(fontFamily: _f, fontSize: 30, height: 1.05, fontWeight: FontWeight.w800, color: ink, letterSpacing: -0.5);
  static TextStyle get h1 =>
      const TextStyle(fontFamily: _f, fontSize: 22, height: 1.1, fontWeight: FontWeight.w800, color: ink, letterSpacing: -0.3);
  static TextStyle get h2 =>
      const TextStyle(fontFamily: _f, fontSize: 17, fontWeight: FontWeight.w700, color: ink, letterSpacing: -0.2);
  static TextStyle get body =>
      const TextStyle(fontFamily: _f, fontSize: 14.5, height: 1.4, fontWeight: FontWeight.w500, color: ink);
  static TextStyle get label =>
      const TextStyle(fontFamily: _f, fontSize: 12.5, fontWeight: FontWeight.w600, color: ink2);
  static TextStyle get kicker => const TextStyle(
      fontFamily: _f, fontSize: 11, fontWeight: FontWeight.w700, color: gold, letterSpacing: 1.6);
  static TextStyle get figure =>
      const TextStyle(fontFamily: _f, fontSize: 26, fontWeight: FontWeight.w800, color: ink, letterSpacing: -0.5);
}

/// Soft-white page ground with an optional faint celestial wash at the top.
class SkyScaffold extends StatelessWidget {
  const SkyScaffold({super.key, required this.child, this.bottomNavigationBar});
  final Widget child;
  final Widget? bottomNavigationBar;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Sky.bg,
      bottomNavigationBar: bottomNavigationBar,
      body: child,
    );
  }
}

/// White rounded card with a hairline border + soft elevation. The workhorse.
class SkyCard extends StatelessWidget {
  const SkyCard({super.key, required this.child, this.onTap, this.padding, this.gradient, this.color});
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry? padding;
  final Gradient? gradient;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final content = Container(
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: gradient == null ? (color ?? Sky.card) : null,
        gradient: gradient,
        borderRadius: BorderRadius.circular(20),
        border: gradient == null ? Border.all(color: Sky.line) : null,
        boxShadow: Sky.soft,
      ),
      child: child,
    );
    if (onTap == null) return content;
    return Material(
      color: Colors.transparent,
      child: InkWell(borderRadius: BorderRadius.circular(20), onTap: onTap, child: content),
    );
  }
}

/// A titled section header with an optional trailing action.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 4, 2, 10),
      child: Row(
        children: [
          Expanded(child: Text(title, style: Sky.h2)),
          if (action != null)
            GestureDetector(
              onTap: onAction,
              child: Text(action!, style: Sky.label.copyWith(color: Sky.purple, fontWeight: FontWeight.w700)),
            ),
        ],
      ),
    );
  }
}

/// A compact metric tile: caption + big number, with an accent icon chip.
class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.accent = Sky.purple,
    this.sub,
  });
  final String label;
  final String value;
  final IconData icon;
  final Color accent;
  final String? sub;

  @override
  Widget build(BuildContext context) {
    // A warm white→cream gradient with a faint gold hairline — the "golden
    // touch" that lifts the metric tiles above flat white.
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Colors.white, Color(0xFFFFFCF4)],
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFEAD79A).withValues(alpha: 0.5)),
        boxShadow: Sky.soft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(color: accent.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(11)),
            child: Icon(icon, size: 18, color: accent),
          ),
          const SizedBox(height: 12),
          Text(value, style: Sky.figure.copyWith(fontSize: 22)),
          const SizedBox(height: 2),
          Text(label, style: Sky.label.copyWith(fontSize: 12)),
          if (sub != null) ...[
            const SizedBox(height: 2),
            Text(sub!, style: Sky.label.copyWith(fontSize: 11, color: accent, fontWeight: FontWeight.w700)),
          ],
        ],
      ),
    );
  }
}

/// A compact, tactile online/offline toggle with a light haptic tap — smaller
/// and more characterful than a stock Switch. Glows green + shows a bolt when
/// live; a dim power icon when off.
class OnlineToggle extends StatelessWidget {
  const OnlineToggle({super.key, required this.value, required this.onChanged});
  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onChanged == null
          ? null
          : () {
              HapticFeedback.mediumImpact();
              onChanged!(!value);
            },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 240),
        curve: Curves.easeOut,
        width: 54,
        height: 30,
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: value ? Sky.green : const Color(0xFFCEC8DC),
          borderRadius: BorderRadius.circular(999),
          boxShadow: value
              ? [BoxShadow(color: Sky.green.withValues(alpha: 0.45), blurRadius: 12, offset: const Offset(0, 3))]
              : null,
        ),
        child: AnimatedAlign(
          duration: const Duration(milliseconds: 240),
          curve: Curves.easeOutBack,
          alignment: value ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            width: 24,
            height: 24,
            decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: Sky.soft),
            child: Icon(value ? Icons.bolt_rounded : Icons.power_settings_new_rounded,
                size: 14, color: value ? Sky.green : const Color(0xFF9A93AD)),
          ),
        ),
      ),
    );
  }
}

/// A minimal filled sparkline (line + soft gradient fill + endpoint dot).
class Sparkline extends StatelessWidget {
  const Sparkline({super.key, required this.points, this.color = Sky.purple, this.height = 40});
  final List<double> points;
  final Color color;
  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      width: double.infinity,
      child: CustomPaint(painter: _SparkPainter(points, color)),
    );
  }
}

class _SparkPainter extends CustomPainter {
  _SparkPainter(this.pts, this.color);
  final List<double> pts;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (pts.length < 2) return;
    final maxV = pts.reduce(math.max);
    final minV = pts.reduce(math.min);
    final range = (maxV - minV).abs() < 0.001 ? 1.0 : (maxV - minV);
    Offset at(int i) => Offset(
          size.width * i / (pts.length - 1),
          size.height - ((pts[i] - minV) / range) * (size.height - 6) - 3,
        );
    final line = Path()..moveTo(at(0).dx, at(0).dy);
    for (var i = 1; i < pts.length; i++) {
      line.lineTo(at(i).dx, at(i).dy);
    }
    final fill = Path.from(line)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(
      fill,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [color.withValues(alpha: 0.22), color.withValues(alpha: 0)],
        ).createShader(Offset.zero & size),
    );
    canvas.drawPath(
      line,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.4
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    canvas.drawCircle(at(pts.length - 1), 3.2, Paint()..color = color);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// A small rounded pill/label.
class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, this.color = Sky.purple, this.icon, this.filled = false});
  final String text;
  final Color color;
  final IconData? icon;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: icon == null ? 10 : 8, vertical: 5),
      decoration: BoxDecoration(
        color: filled ? color : color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 12, color: filled ? Colors.white : color), const SizedBox(width: 4)],
          Text(text,
              style: Sky.label.copyWith(
                  fontSize: 11.5, fontWeight: FontWeight.w700, color: filled ? Colors.white : color)),
        ],
      ),
    );
  }
}

/// Full-width gold gradient button.
class GoldButton extends StatelessWidget {
  const GoldButton({super.key, required this.label, this.icon, this.onPressed, this.loading = false});
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !loading;
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(15),
          onTap: enabled ? onPressed : null,
          child: Ink(
            decoration: BoxDecoration(
              color: Sky.purple,
              borderRadius: BorderRadius.circular(15),
              boxShadow: [BoxShadow(color: Sky.purple.withValues(alpha: 0.28), blurRadius: 16, offset: const Offset(0, 8))],
            ),
            child: Container(
              height: 52,
              alignment: Alignment.center,
              child: loading
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (icon != null) ...[Icon(icon, size: 18, color: Colors.white), const SizedBox(width: 8)],
                        Text(label, style: Sky.body.copyWith(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15)),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Outlined/ghost button for secondary actions.
class GhostButton extends StatelessWidget {
  const GhostButton({super.key, required this.label, this.icon, this.onPressed, this.color = Sky.purple});
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onPressed,
        child: Container(
          height: 50,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: color.withValues(alpha: 0.4)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[Icon(icon, size: 18, color: color), const SizedBox(width: 8)],
              Text(label, style: Sky.body.copyWith(color: color, fontWeight: FontWeight.w700)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Faint zodiac-wheel + sparkle wash for celestial headers (drawn, no assets).
class CelestialWash extends StatelessWidget {
  const CelestialWash({super.key, this.opacity = 1, this.tint = Colors.white});
  final double opacity;
  final Color tint;
  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Opacity(
        opacity: opacity,
        child: CustomPaint(painter: _WashPainter(tint), size: Size.infinite),
      ),
    );
  }
}

class _WashPainter extends CustomPainter {
  _WashPainter(this.tint);
  final Color tint;
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = tint.withValues(alpha: 0.12);
    final c = Offset(size.width - 40, 30);
    for (final r in [26.0, 44.0, 62.0]) {
      canvas.drawCircle(c, r, p);
    }
    final dot = Paint()..color = tint.withValues(alpha: 0.5);
    for (final o in [const Offset(28, 26), Offset(size.width * 0.5, 18), const Offset(60, 70)]) {
      canvas.drawCircle(o, 1.4, dot);
    }
  }

  @override
  bool shouldRepaint(covariant _WashPainter oldDelegate) => false;
}
