import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../app/feature_flags.dart';
import '../profile/favourites_screen.dart';
import '../profile_setup/onboarding_style.dart';
import 'home_continue_rail.dart' show RailBand;

/// "Your Astrologers" — the user's favourited astrologers (AI or human) as a
/// horizontal rail. Tap a face to open that astrologer. Hidden when empty.
class FavoritesRail extends ConsumerWidget {
  const FavoritesRail({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ids = ref.watch(myProfileProvider).valueOrNull?.favouriteAstrologers ?? const <String>[];
    if (ids.isEmpty) return const SizedBox.shrink();
    return RailBand(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 4, 12, 10),
            child: Row(
              children: [
                const Icon(Icons.favorite_rounded, size: 16, color: AppColors.error),
                const SizedBox(width: 7),
                Expanded(child: Text('Your Loved Astrologers', style: Ob.title.copyWith(fontSize: 19))),
                if (ids.length > 4)
                  GestureDetector(
                    onTap: () => Navigator.of(context)
                        .push(MaterialPageRoute(builder: (_) => const FavouritesScreen())),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      child: Text('View all  →',
                          style: Ob.option.copyWith(color: Ob.purple, fontWeight: FontWeight.w700, fontSize: 13)),
                    ),
                  ),
              ],
            ),
          ),
          SizedBox(
            height: 108,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              itemCount: ids.length,
              itemBuilder: (_, i) => Padding(
                padding: const EdgeInsets.only(right: 14),
                child: _FavItem(id: ids[i]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

final _favAstrologerProvider =
    StreamProvider.autoDispose.family<Astrologer?, String>((ref, id) {
  return ref.watch(astrologerRepositoryProvider).watchOne(id).map((a) => a).handleError((_) {});
});

class _FavItem extends ConsumerWidget {
  const _FavItem({required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = ref.watch(_favAstrologerProvider(id)).valueOrNull;
    // ... hidden in free v1 — only AI astrologers are shown when money is off
    if (!kMonetizationEnabled && a != null && !a.isAI) return const SizedBox.shrink();
    final name = a?.name ?? '…';
    return GestureDetector(
      onTap: () => context.push('/astrologer/$id'),
      child: SizedBox(
        width: 72,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  padding: const EdgeInsets.all(2.4),
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(colors: [Color(0xFFFFD98A), Color(0xFFF5B301)]),
                  ),
                  child: AppAvatar(name: name, photoUrl: a?.profilePhoto, size: 58),
                ),
                if (a?.isOnline ?? false)
                  Positioned(
                    right: 2,
                    bottom: 2,
                    child: Container(
                      width: 14,
                      height: 14,
                      decoration: BoxDecoration(
                        color: AppColors.online,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 5),
            Text(name,
                style: Ob.note.copyWith(fontSize: 11.5, color: Ob.navy, fontWeight: FontWeight.w600),
                maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
