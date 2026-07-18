import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'store_models.dart';
import 'store_providers.dart';

// Palette for the Astro Store hero (soft lavender + purple + gold), matching the
// approved reference.
const _lavA = Color(0xFFEFE8FF);
const _lavB = Color(0xFFF5F0FF);
const _lavC = Color(0xFFFBF8FF);
const _purple = Color(0xFF6E4FB8);
const _purpleDeep = Color(0xFF463089);
const _ink = Color(0xFF2B2140);
const _muted = Color(0xFF6E6689);
const _gold = Color(0xFFD9A93A);

/// The home "Astro Store" hero — a premium card: brand row + a spiritual product
/// hero (headline, gold divider, subtext, Explore CTA, product image) + a category
/// strip. All content is portal-managed: the hero comes from the storefront hero
/// banner (image/headline/subtext/CTA); the category taglines are each category's
/// `blurb`. Hidden entirely when the catalog has no active categories.
class StoreRail extends ConsumerWidget {
  const StoreRail({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cats = ref.watch(storeRootCategoriesProvider);
    if (cats.isEmpty) return const SizedBox.shrink();

    final banners = ref.watch(storeBannersProvider).valueOrNull ?? const <StoreBanner>[];
    final hero = banners.isNotEmpty ? banners.first : null;

    final headline = (hero?.headline.trim().isNotEmpty ?? false)
        ? hero!.headline.trim()
        : 'Blessings for Every Aspect of Life';
    final subtext = (hero?.subtext.trim().isNotEmpty ?? false)
        ? hero!.subtext.trim()
        : 'Handpicked spiritual products for peace, positivity & prosperity.';
    final cta = (hero?.ctaLabel.trim().isNotEmpty ?? false) ? hero!.ctaLabel.trim() : 'Explore Store';
    final heroImage = hero?.image.trim() ?? '';

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFFE6DCFA)),
        boxShadow: [BoxShadow(color: _purpleDeep.withValues(alpha: 0.10), blurRadius: 22, offset: const Offset(0, 10))],
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [_lavA, _lavB, _lavC],
        ),
      ),
      child: Column(
        children: [
          _brandRow(),
          _heroBody(context, headline, subtext, cta, heroImage),
          const SizedBox(height: 14),
          _categoryStrip(context, cats),
        ],
      ),
    );
  }

  // ---- brand row: bag + name + tagline + authentic badge ----
  Widget _brandRow() => Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 12, 2),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [_purple, _purpleDeep]),
                borderRadius: BorderRadius.circular(11),
                boxShadow: [BoxShadow(color: _purple.withValues(alpha: 0.4), blurRadius: 10, offset: const Offset(0, 5))],
              ),
              child: const Icon(Icons.shopping_bag_rounded, color: Colors.white, size: 19),
            ),
            const SizedBox(width: 10),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Astro Store',
                      style: TextStyle(fontFamily: 'serif', fontSize: 17, fontWeight: FontWeight.w800, color: _ink)),
                  SizedBox(height: 1),
                  Text('Divine essentials for a better you',
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 10.5, color: _muted, fontWeight: FontWeight.w500)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [BoxShadow(color: _purpleDeep.withValues(alpha: 0.08), blurRadius: 8, offset: const Offset(0, 3))],
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.verified_user_rounded, size: 15, color: _purple),
                  SizedBox(width: 5),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('100% Authentic',
                          style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: _ink)),
                      Text('Energized & Blessed',
                          style: TextStyle(fontSize: 8.5, color: _muted)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      );

  // ---- hero: headline + gold divider + subtext + CTA, with product image ----
  Widget _heroBody(BuildContext context, String headline, String subtext, String cta, String image) {
    // Last word of the headline in purple (a subtle accent, like the reference).
    final words = headline.split(' ');
    final head = words.length > 1 ? words.sublist(0, words.length - 1).join(' ') : headline;
    final tail = words.length > 1 ? ' ${words.last}' : '';

    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 12, 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            flex: 62,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                RichText(
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  text: TextSpan(
                    style: const TextStyle(fontFamily: 'serif', fontSize: 19, fontWeight: FontWeight.w700, height: 1.12, color: _ink),
                    children: [
                      TextSpan(text: head),
                      TextSpan(text: tail, style: const TextStyle(color: _purple)),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Container(width: 26, height: 1.5, color: _gold.withValues(alpha: 0.7)),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 5),
                      child: Icon(Icons.auto_awesome, size: 9, color: _gold),
                    ),
                    Container(width: 12, height: 1.5, color: _gold.withValues(alpha: 0.35)),
                  ],
                ),
                const SizedBox(height: 8),
                Text(subtext,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11.5, color: _muted, height: 1.35, fontWeight: FontWeight.w500)),
                const SizedBox(height: 12),
                GestureDetector(
                  onTap: () => context.push('/store'),
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(15, 9, 7, 9),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [_purple, _purpleDeep]),
                      borderRadius: BorderRadius.circular(22),
                      boxShadow: [BoxShadow(color: _purple.withValues(alpha: 0.4), blurRadius: 12, offset: const Offset(0, 6))],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(cta,
                            style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w800)),
                        const SizedBox(width: 8),
                        Container(
                          width: 22,
                          height: 22,
                          decoration: const BoxDecoration(color: Colors.white24, shape: BoxShape.circle),
                          child: const Icon(Icons.arrow_forward_rounded, size: 13, color: Colors.white),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Expanded(flex: 38, child: _heroArt(image)),
        ],
      ),
    );
  }

  Widget _heroArt(String image) {
    if (image.isEmpty) {
      // Graceful fallback so the hero never looks empty before an image is set.
      return SizedBox(
        height: 128,
        child: Center(
          child: Container(
            width: 96,
            height: 96,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(colors: [_purple.withValues(alpha: 0.18), _purple.withValues(alpha: 0.02)]),
            ),
            child: const Icon(Icons.spa_rounded, size: 42, color: _purple),
          ),
        ),
      );
    }
    return SizedBox(
      height: 132,
      child: CachedNetworkImage(
        imageUrl: image,
        fit: BoxFit.contain,
        alignment: Alignment.bottomCenter,
        placeholder: (_, __) => const Center(
          child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.2, color: _purple)),
        ),
        errorWidget: (_, __, ___) => const Center(child: Icon(Icons.spa_rounded, size: 40, color: _purple)),
      ),
    );
  }

  // ---- category strip: icon/image + name + blurb, on a light panel ----
  Widget _categoryStrip(BuildContext context, List<StoreCategory> cats) {
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: Color(0xEEFFFFFF),
        border: Border(top: BorderSide(color: Color(0xFFEDE6FA))),
      ),
      child: SizedBox(
        height: 64,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          itemCount: cats.length,
          separatorBuilder: (_, __) => Container(
            width: 1,
            margin: const EdgeInsets.symmetric(vertical: 14),
            color: const Color(0xFFEBE3F8),
          ),
          itemBuilder: (_, i) => _CategoryChip(category: cats[i]),
        ),
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({required this.category});
  final StoreCategory category;

  @override
  Widget build(BuildContext context) {
    final blurb = category.blurb.trim();
    return GestureDetector(
      onTap: () => context.push('/store/category/${category.id}', extra: category.name),
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(width: 30, height: 30, child: _icon()),
            const SizedBox(width: 8),
            Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(category.name,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: _ink)),
                if (blurb.isNotEmpty)
                  Text(blurb,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 10, color: _muted, fontWeight: FontWeight.w500)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _icon() {
    if (category.image.trim().isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: CachedNetworkImage(
          imageUrl: category.image.trim(),
          width: 30, height: 30, fit: BoxFit.cover,
          errorWidget: (_, __, ___) => _emojiFallback(),
        ),
      );
    }
    return _emojiFallback();
  }

  Widget _emojiFallback() => Container(
        decoration: BoxDecoration(color: _purple.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(8)),
        alignment: Alignment.center,
        child: Text(category.emoji.isNotEmpty ? category.emoji : '🪔', style: const TextStyle(fontSize: 15)),
      );
}
