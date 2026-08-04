import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import 'badges.dart';

/// Circular avatar with graceful fallback to initials, optional presence dot.
class AppAvatar extends StatelessWidget {
  const AppAvatar({
    super.key,
    required this.name,
    this.photoUrl,
    this.size = 56,
    this.showPresence = false,
    this.online = false,
  });

  final String name;
  final String? photoUrl;
  final double size;
  final bool showPresence;
  final bool online;

  String get _initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts.first.characters.first.toUpperCase();
    return (parts.first.characters.first + parts.last.characters.first).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    // Decode the portrait at ~2× the on-screen size, never the full ~1000px
    // source — a 56px circle keeps a ~112px bitmap, not a 1MP one. Slashes
    // decode time and image-cache memory across every rail, card, and screen.
    final dpr = MediaQuery.maybeOf(context)?.devicePixelRatio ?? 2.0;
    final decodePx = (size * dpr).round();
    final avatar = Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        color: AppColors.accentLavender,
        shape: BoxShape.circle,
      ),
      clipBehavior: Clip.antiAlias,
      child: (photoUrl != null && photoUrl!.isNotEmpty)
          ? CachedNetworkImage(
              imageUrl: photoUrl!,
              fit: BoxFit.cover,
              width: size,
              height: size,
              memCacheWidth: decodePx,
              memCacheHeight: decodePx,
              fadeInDuration: const Duration(milliseconds: 150),
              placeholder: (_, __) => _initialsView(),
              errorWidget: (_, __, ___) => _initialsView(),
            )
          : _initialsView(),
    );

    if (!showPresence) return avatar;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        avatar,
        Positioned(
          right: 0,
          bottom: 0,
          child: PresenceDot(online: online, size: size * 0.28),
        ),
      ],
    );
  }

  Widget _initialsView() => Center(
        child: Text(
          _initials,
          style: AppTypography.subtitle.copyWith(
            color: AppColors.primary,
            fontSize: size * 0.36,
          ),
        ),
      );
}
