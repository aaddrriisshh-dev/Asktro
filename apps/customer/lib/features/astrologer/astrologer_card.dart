import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

/// Directory card used across home rails and search results (Part 2/3).
class AstrologerCard extends StatelessWidget {
  const AstrologerCard({super.key, required this.astrologer, this.compact = false});
  final Astrologer astrologer;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final a = astrologer;
    return AppCard(
      onTap: () => context.push('/astrologer/${a.id}'),
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
                        if (a.verified) ...[
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
              LabelBadge(text: a.rateLabel, filled: false),
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
                  icon: Icons.chat_bubble_outline_rounded,
                  label: 'Chat',
                  enabled: a.isConsultable,
                  onTap: () => context.push('/astrologer/${a.id}'),
                ),
                // AI personas are chat-only — no voice/video.
                if (!a.isAI) ...[
                  const SizedBox(width: AppSpacing.sm),
                  _ModeButton(
                    icon: Icons.call_outlined,
                    label: 'Voice',
                    enabled: a.isConsultable,
                    onTap: () => context.push('/astrologer/${a.id}'),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  _ModeButton(
                    icon: Icons.videocam_outlined,
                    label: 'Video',
                    enabled: a.isConsultable,
                    onTap: () => context.push('/astrologer/${a.id}'),
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
  const _ModeButton({required this.icon, required this.label, required this.enabled, required this.onTap});
  final IconData icon;
  final String label;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Opacity(
        opacity: enabled ? 1 : 0.45,
        child: Material(
          color: AppColors.accentLavender,
          borderRadius: BorderRadius.circular(AppRadius.button),
          child: InkWell(
            borderRadius: BorderRadius.circular(AppRadius.button),
            onTap: enabled ? onTap : null,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Column(
                children: [
                  Icon(icon, size: 20, color: AppColors.primary),
                  const SizedBox(height: 2),
                  Text(label, style: AppTypography.caption.copyWith(color: AppColors.primary)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
