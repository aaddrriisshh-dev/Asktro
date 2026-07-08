import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../astrologer/astrologer_profile_screen.dart';

/// One favourite astrologer, streamed live so name/photo/rating stay current.
final _favAstrologerProvider = StreamProvider.autoDispose.family<Astrologer?, String>((ref, id) {
  try {
    return ref.watch(astrologerRepositoryProvider).watchOne(id).map<Astrologer?>((a) => a);
  } catch (_) {
    return const Stream.empty();
  }
});

/// Lists the astrologers the customer has favourited (the heart toggle on an
/// astrologer's profile). Reads the `favouriteAstrologers` ids off the profile.
class FavouritesScreen extends ConsumerWidget {
  const FavouritesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ids = ref.watch(myProfileProvider).valueOrNull?.favouriteAstrologers ?? const <String>[];
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('My Favourites')),
      body: ids.isEmpty
          ? const EmptyState(
              icon: Icons.favorite_border_rounded,
              title: 'No favourites yet',
              message: "Tap the heart on an astrologer's profile to save them here.",
            )
          : ListView.separated(
              padding: EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg,
                  AppSpacing.lg + MediaQuery.of(context).padding.bottom,),
              itemCount: ids.length,
              separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.md),
              itemBuilder: (_, i) => _FavTile(astrologerId: ids[i]),
            ),
    );
  }
}

class _FavTile extends ConsumerWidget {
  const _FavTile({required this.astrologerId});
  final String astrologerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = ref.watch(_favAstrologerProvider(astrologerId)).valueOrNull;
    if (a == null) return const SizedBox.shrink();
    return GestureDetector(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => AstrologerProfileScreen(astrologerId: a.id)),
      ),
      child: AppCard(
        child: Row(
          children: [
            AppAvatar(name: a.name, photoUrl: a.profilePhoto, size: 48),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(a.name,
                      style: AppTypography.body.copyWith(fontWeight: FontWeight.w700),
                      overflow: TextOverflow.ellipsis,),
                  const SizedBox(height: 2),
                  Text(
                    [
                      if (a.experience > 0) '${a.experience} yrs',
                      if (a.rating > 0) '★ ${a.rating.toStringAsFixed(1)}',
                      '${a.totalConsultations} sessions',
                    ].join('  •  '),
                    style: AppTypography.caption,
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            if (a.onlineStatus)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.success.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(AppRadius.chip),
                ),
                child: Text('Online',
                    style: AppTypography.caption.copyWith(
                        color: AppColors.success, fontWeight: FontWeight.w800, fontSize: 11,),),
              )
            else
              const Icon(Icons.chevron_right_rounded, color: Color(0xFFB9B3C9)),
          ],
        ),
      ),
    );
  }
}
