import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/feature_flags.dart';

/// Directory card used across home rails and search results (Part 2/3).
class AstrologerCard extends StatelessWidget {
  const AstrologerCard({super.key, required this.astrologer, this.compact = false, this.requestedSkill});
  final Astrologer astrologer;
  final bool compact;
  /// Set when this card was reached via a home "Browse by skill" tile (e.g.
  /// 'Palmistry'); forwarded to the profile → consultation so the AI can open
  /// palm-led. Null for the normal rails/search.
  final String? requestedSkill;

  @override
  Widget build(BuildContext context) {
    final a = astrologer;
    return AppCard(
      onTap: () => context.push('/astrologer/${a.id}', extra: requestedSkill),
      border: Border.all(color: const Color(0xFFECE5F8), width: 1),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(2.5),
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFFEAD079), Color(0xFFD4AF37)],
                  ),
                ),
                child: AppAvatar(
                  name: a.name,
                  photoUrl: a.profilePhoto,
                  size: 56,
                  showPresence: true,
                  online: a.isOnline,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(a.name,
                              style: AppTypography.subtitle, overflow: TextOverflow.ellipsis,),
                        ),
                        if (a.verified && !a.isAI) ...[
                          const SizedBox(width: 6),
                          const VerifiedBadge(),
                        ],
                        if (a.isAI) ...[
                          const SizedBox(width: 6),
                          const AiBadge(compact: true),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      a.expertise.take(2).join(' • '),
                      style: AppTypography.caption,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(Icons.star_rounded, size: 16, color: AppColors.warning),
                        const SizedBox(width: 2),
                        Text(a.rating.toStringAsFixed(1), style: AppTypography.caption),
                        const SizedBox(width: 8),
                        Text('${a.experience}y exp', style: AppTypography.caption),
                      ],
                    ),
                  ],
                ),
              ),
              // Per-minute rate only for PAID (human) astrologers — AI is free.
              if (kMonetizationEnabled && !a.isAI) LabelBadge(text: a.rateLabel, filled: false),
            ],
          ),
          if (!compact) ...[
            const SizedBox(height: AppSpacing.md),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: a.languages.take(3).map((l) => TagChip(l)).toList(),
            ),
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                _ModeButton(
                  icon: Icons.chat_bubble_rounded,
                  label: 'Chat',
                  enabled: a.isConsultable,
                  // AI personas are chat-only — give their single Chat button a
                  // solid purple fill (white text) so it reads as the primary
                  // action, and keep the whole bar short.
                  filled: a.isAI,
                  onTap: () => context.push('/astrologer/${a.id}', extra: requestedSkill),
                ),
                // AI personas are chat-only — no voice/video. Human voice/video
                // are hidden in v2 too (kCalls/kVideoEnabled OFF — calling engine
                // removed), so the whole app is chat-only until calls return.
                if (!a.isAI && kCallsEnabled) ...[
                  const SizedBox(width: AppSpacing.sm),
                  _ModeButton(
                    icon: Icons.call_outlined,
                    label: 'Voice',
                    enabled: a.isConsultable,
                    onTap: () => context.push('/astrologer/${a.id}', extra: requestedSkill),
                  ),
                ],
                if (!a.isAI && kVideoEnabled) ...[
                  const SizedBox(width: AppSpacing.sm),
                  _ModeButton(
                    icon: Icons.videocam_outlined,
                    label: 'Video',
                    enabled: a.isConsultable,
                    onTap: () => context.push('/astrologer/${a.id}', extra: requestedSkill),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _ModeButton extends StatelessWidget {
  const _ModeButton({
    required this.icon,
    required this.label,
    required this.enabled,
    required this.onTap,
    this.filled = false,
  });
  final IconData icon;
  final String label;
  final bool enabled;
  final VoidCallback onTap;

  /// Solid purple fill with white content (used for the AI Chat CTA); otherwise
  /// a soft lavender chip with purple content (the voice/video actions).
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final fg = filled ? Colors.white : AppColors.primary;
    // Compact single-row layout (icon + label side by side, ~38px tall) so the
    // action bar no longer eats a big block of vertical space.
    return Expanded(
      child: Opacity(
        opacity: enabled ? 1 : 0.45,
        child: Material(
          color: filled ? AppColors.primary : AppColors.accentLavender,
          borderRadius: BorderRadius.circular(AppRadius.button),
          child: InkWell(
            borderRadius: BorderRadius.circular(AppRadius.button),
            onTap: enabled ? onTap : null,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 9),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, size: 17, color: fg),
                  const SizedBox(width: 6),
                  Text(
                    label,
                    style: AppTypography.caption.copyWith(
                      color: fg,
                      fontWeight: filled ? FontWeight.w700 : FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
