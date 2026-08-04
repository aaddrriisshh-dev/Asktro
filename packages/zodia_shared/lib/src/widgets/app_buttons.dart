import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';

/// Primary CTA: purple gradient, full-width, 56dp, soft shadow, scale-on-tap,
/// ripple, loading + disabled states (Part 2).
class PrimaryButton extends StatefulWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.icon,
    this.expand = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;
  final bool expand;

  @override
  State<PrimaryButton> createState() => _PrimaryButtonState();
}

class _PrimaryButtonState extends State<PrimaryButton> {
  bool _pressed = false;

  bool get _enabled => widget.onPressed != null && !widget.loading;

  @override
  Widget build(BuildContext context) {
    return AnimatedScale(
      scale: _pressed ? 0.97 : 1,
      duration: AppSizes.tapAnim,
      child: Opacity(
        opacity: _enabled ? 1 : 0.5,
        child: GestureDetector(
          onTapDown: _enabled ? (_) => setState(() => _pressed = true) : null,
          onTapUp: _enabled ? (_) => setState(() => _pressed = false) : null,
          onTapCancel: _enabled ? () => setState(() => _pressed = false) : null,
          onTap: _enabled ? widget.onPressed : null,
          child: Container(
            height: AppSizes.buttonHeight,
            width: widget.expand ? double.infinity : null,
            padding: widget.expand ? null : const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
            decoration: BoxDecoration(
              gradient: AppColors.primaryGradient,
              borderRadius: AppRadius.buttonR,
              boxShadow: _enabled ? AppShadows.button(AppColors.primary) : null,
            ),
            child: Center(
              child: widget.loading
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                    )
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (widget.icon != null) ...[
                          Icon(widget.icon, color: Colors.white, size: 20),
                          const SizedBox(width: AppSpacing.sm),
                        ],
                        Text(widget.label, style: AppTypography.button),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Secondary button: white background, purple border + text, soft shadow.
class SecondaryButton extends StatelessWidget {
  const SecondaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.leading,
    this.expand = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  // Custom leading widget (e.g. a real brand logo). Takes precedence over [icon]
  // when provided — lets callers show an actual logo instead of a Material glyph.
  final Widget? leading;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final Widget iconSlot = leading ??
        (icon == null ? const SizedBox.shrink() : Icon(icon, size: 20, color: AppColors.primary));
    return SizedBox(
      height: AppSizes.buttonHeight,
      width: expand ? double.infinity : null,
      child: OutlinedButton.icon(
        onPressed: onPressed,
        icon: iconSlot,
        label: Text(label, style: AppTypography.button.copyWith(color: AppColors.primary)),
        style: OutlinedButton.styleFrom(
          backgroundColor: AppColors.card,
          side: const BorderSide(color: AppColors.primary, width: 1.4),
          shape: const RoundedRectangleBorder(borderRadius: AppRadius.buttonR),
        ),
      ),
    );
  }
}

/// Destructive text button (only place red is allowed — Part 1/2).
class DestructiveButton extends StatelessWidget {
  const DestructiveButton({super.key, required this.label, required this.onPressed});
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onPressed,
      child: Text(label, style: AppTypography.button.copyWith(color: AppColors.error)),
    );
  }
}
