import 'package:flutter/material.dart';
import 'package:shared_flutter/shared_flutter.dart';

import 'onboarding_style.dart';

/// Shared chrome for every onboarding step. Background is composed from a small
/// reusable celestial library (faint star field + corner glow + subtle temple
/// scenery) plus ONE contextual illustration per screen in the upper-right
/// whitespace — decorations never sit behind body text or buttons.
class OnboardingScaffold extends StatelessWidget {
  const OnboardingScaffold({
    super.key,
    required this.content,
    required this.footer,
    this.stepIndex,
    this.totalSteps = 7,
    this.stepIcon,
    this.showExploreMore = false,
    this.onExploreMore,
  });

  final Widget content;
  final Widget footer;
  final int? stepIndex; // null hides the stepper
  final int totalSteps;
  final IconData? stepIcon;
  final bool showExploreMore;
  final VoidCallback? onExploreMore;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Ob.bgColor,
      body: Stack(
        children: [
          // Faint zodiac-wheel watermark bleeding off the upper-right edge —
          // the recurring celestial motif on every onboarding screen.
          Positioned(
            top: 64,
            right: -150,
            child: IgnorePointer(
              child: Opacity(opacity: 0.16, child: Image.asset(Ob.zodiacWheel, width: 430)),
            ),
          ),
          // A lone gold sparkle near the heading.
          const Positioned(
            top: 150,
            left: 22,
            child: IgnorePointer(child: Icon(Icons.auto_awesome, color: Ob.gold, size: 17)),
          ),
          // Subtle temple scenery along the bottom.
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: IgnorePointer(
              child: Opacity(opacity: 0.5, child: Image.asset(Ob.scenery, fit: BoxFit.fitWidth)),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                _header(),
                if (stepIndex != null) ...[
                  const SizedBox(height: 18),
                  StepBar(currentIndex: stepIndex!, total: totalSteps, currentIcon: stepIcon),
                ],
                // Content and the CTA scroll together, so the button sits DIRECTLY
                // under wherever the content ends — not pinned to the screen bottom
                // with a blank gap above it. Any leftover space falls BELOW the
                // button and just shows the celestial background. On the rare tall
                // step (or with the keyboard up) the whole thing scrolls as one,
                // so nothing is ever clipped.
                Expanded(
                  child: SingleChildScrollView(
                    physics: const BouncingScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(
                        Ob.screenPad, Ob.section, Ob.screenPad, 24,),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        content,
                        const SizedBox(height: 24),
                        footer,
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _header() {
    return Column(
      children: [
        if (showExploreMore)
          Align(
            alignment: Alignment.centerRight,
            child: Padding(
              padding: const EdgeInsets.only(right: 20, top: 6),
              child: GestureDetector(
                onTap: onExploreMore,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Explore More',
                        style: Ob.subtitle.copyWith(color: Ob.navy, fontWeight: FontWeight.w600),),
                    const Icon(Icons.chevron_right_rounded, color: Ob.navy, size: 20),
                  ],
                ),
              ),
            ),
          ),
        Padding(
          padding: EdgeInsets.only(top: showExploreMore ? 4 : 14),
          child: const AppLogo(height: 54),
        ),
      ],
    );
  }
}

/// Gold-check step indicator.
class StepBar extends StatelessWidget {
  const StepBar({super.key, required this.currentIndex, required this.total, this.currentIcon});
  final int currentIndex;
  final int total;
  final IconData? currentIcon;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(total, (i) {
        final done = i < currentIndex;
        final current = i == currentIndex;
        Widget dot;
        if (done) {
          dot = Container(
            width: 30,
            height: 30,
            decoration: const BoxDecoration(gradient: Ob.goldCircle, shape: BoxShape.circle),
            child: const Icon(Icons.check_rounded, color: Colors.white, size: 18),
          );
        } else if (current) {
          dot = Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              border: Border.all(color: Ob.gold, width: 1.8),
              boxShadow: Ob.softShadow,
            ),
            child: Icon(currentIcon ?? Icons.circle, color: Ob.purple, size: 18),
          );
        } else {
          dot = Container(
            width: 24,
            height: 24,
            decoration: const BoxDecoration(color: Color(0xFFE4DEF3), shape: BoxShape.circle),
          );
        }
        return Padding(padding: const EdgeInsets.symmetric(horizontal: 4.5), child: dot);
      }),
    );
  }
}

/// Title with an optional accent word in purple.
Widget obTitle(String text, {String? accent}) {
  if (accent == null || !text.contains(accent)) {
    return Text(text, style: Ob.title);
  }
  final idx = text.indexOf(accent);
  return RichText(
    text: TextSpan(
      style: Ob.title,
      children: [
        TextSpan(text: text.substring(0, idx)),
        TextSpan(text: accent, style: Ob.titleAccent),
        TextSpan(text: text.substring(idx + accent.length)),
      ],
    ),
  );
}

/// Thin gold rule with a centered sparkle.
class SparkleDivider extends StatelessWidget {
  const SparkleDivider({super.key});
  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 46, height: 1.4, color: Ob.gold.withValues(alpha: 0.6)),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 8),
          child: Icon(Icons.auto_awesome, color: Ob.gold, size: 15),
        ),
        Container(
          width: 90,
          height: 1.4,
          decoration: BoxDecoration(
            gradient: LinearGradient(
                colors: [Ob.gold.withValues(alpha: 0.6), Ob.gold.withValues(alpha: 0)],),
          ),
        ),
      ],
    );
  }
}

/// Primary gold CTA — full width, 56dp tall, radius 18.
class GoldButton extends StatefulWidget {
  const GoldButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.icon = Icons.arrow_forward_rounded,
  });
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;

  @override
  State<GoldButton> createState() => _GoldButtonState();
}

class _GoldButtonState extends State<GoldButton> {
  bool _down = false;
  bool get _enabled => widget.onPressed != null && !widget.loading;

  @override
  Widget build(BuildContext context) {
    return AnimatedScale(
      scale: _down ? 0.98 : 1,
      duration: const Duration(milliseconds: 110),
      child: Opacity(
        opacity: _enabled ? 1 : 0.5,
        child: GestureDetector(
          onTapDown: _enabled ? (_) => setState(() => _down = true) : null,
          onTapUp: _enabled ? (_) => setState(() => _down = false) : null,
          onTapCancel: _enabled ? () => setState(() => _down = false) : null,
          onTap: _enabled ? widget.onPressed : null,
          child: Container(
            width: double.infinity,
            height: Ob.btnHeight,
            decoration: BoxDecoration(
              gradient: Ob.goldGradient,
              borderRadius: BorderRadius.circular(Ob.btnRadius),
              boxShadow: _enabled ? Ob.goldShadow : null,
            ),
            child: widget.loading
                ? const Center(
                    child: SizedBox(
                      height: 24,
                      width: 24,
                      child: CircularProgressIndicator(strokeWidth: 2.6, color: Colors.white),
                    ),
                  )
                : Stack(
                    alignment: Alignment.center,
                    children: [
                      Text(widget.label, style: Ob.button),
                      if (widget.icon != null)
                        Positioned(
                          right: Ob.screenPad,
                          child: Icon(widget.icon, color: Ob.navy, size: 22),
                        ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

/// Soft lavender note/tip card with an icon.
class InfoNote extends StatelessWidget {
  const InfoNote({super.key, required this.icon, this.title, required this.body});
  final IconData icon;
  final String? title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Ob.lavender, borderRadius: BorderRadius.circular(18)),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: Ob.purple.withValues(alpha: 0.13), shape: BoxShape.circle),
            child: Icon(icon, color: Ob.purple, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (title != null) Text(title!, style: Ob.noteTitle),
                Text(body, style: Ob.note),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// "Your data is 100% secure and private" footer line.
class SecureFooter extends StatelessWidget {
  const SecureFooter({super.key});
  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.verified_user_rounded, color: Ob.gold, size: 16),
        const SizedBox(width: 8),
        Text('Your data is 100% secure and private', style: Ob.secure),
      ],
    );
  }
}

/// Small gold check badge for selected options.
class GoldCheck extends StatelessWidget {
  const GoldCheck({super.key, this.size = 26});
  final double size;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(gradient: Ob.goldCircle, shape: BoxShape.circle),
      child: Icon(Icons.check_rounded, color: Colors.white, size: size * 0.62),
    );
  }
}

/// Full-width selectable row (relationship status) with a coloured icon badge.
class OptionRow extends StatelessWidget {
  const OptionRow({
    super.key,
    required this.icon,
    required this.iconBg,
    required this.iconColor,
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final IconData icon;
  final Color iconBg;
  final Color iconColor;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: selected ? Ob.selectedFill : Ob.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: selected ? Ob.selectedBorder : Ob.border,
            width: selected ? 1.6 : 1,
          ),
          boxShadow: selected ? null : Ob.softShadow,
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: iconBg, shape: BoxShape.circle),
              child: Icon(icon, color: iconColor, size: 22),
            ),
            const SizedBox(width: 14),
            Expanded(child: Text(label, style: Ob.option)),
            if (selected) const GoldCheck(size: 24) else const SizedBox.shrink(),
            const SizedBox(width: 6),
            Icon(Icons.chevron_right_rounded,
                color: selected ? Ob.goldDeep : const Color(0xFFB9B3C9), size: 22,),
          ],
        ),
      ),
    );
  }
}
