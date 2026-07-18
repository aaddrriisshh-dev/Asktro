import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import 'store_models.dart';
import 'store_providers.dart';

// Palette for the Asktro Store hero — soft celestial lavender + purple + gold.
const _purple = Color(0xFF6E4FB8);
const _purpleDeep = Color(0xFF463089);
const _ink = Color(0xFF2B2140);
const _muted = Color(0xFF6E6689);
const _gold = Color(0xFFD9A93A);

/// Home-screen "Asktro Store" hero — a celestial card: brand row + a spiritual
/// product hero (headline, gold divider, subtext, Explore CTA, product image) +
/// the auto-scroll category strip. Hero content (image/headline/subtext/CTA) is
/// portal-managed via `homeSections/storeHero`; categories from the catalog.
final _storeHeroProvider = StreamProvider.autoDispose<Map<String, dynamic>>((ref) {
  return ref
      .watch(firestoreProvider)
      .collection('homeSections')
      .doc('storeHero')
      .snapshots()
      .map((d) => d.data() ?? const <String, dynamic>{});
});

class StoreRail extends ConsumerWidget {
  const StoreRail({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cats = ref.watch(storeRootCategoriesProvider);
    if (cats.isEmpty) return const SizedBox.shrink();

    final h = ref.watch(_storeHeroProvider).valueOrNull ?? const <String, dynamic>{};
    String s(String k, String d) {
      final v = (h[k] ?? '').toString().trim();
      return v.isNotEmpty ? v : d;
    }

    final headline = s('headline', 'Blessings for Every Aspect of Life');
    final subtext = s('subtext', 'Handpicked spiritual products for peace, positivity & prosperity.');
    final cta = s('cta', 'Explore Store');
    final heroImage = (h['image'] ?? '').toString().trim();

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFFE0D3F7)),
        boxShadow: [BoxShadow(color: _purpleDeep.withValues(alpha: 0.12), blurRadius: 22, offset: const Offset(0, 10))],
        // Celestial gradient ground.
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFEDE3FF), Color(0xFFE6DBFF), Color(0xFFF4EEFF)],
        ),
      ),
      child: Stack(
        children: [
          // Scattered stars for the celestial vibe (faint, behind everything).
          const Positioned.fill(child: IgnorePointer(child: _Stars())),
          Column(
            children: [
              _brandRow(),
              _heroBody(context, headline, subtext, cta, heroImage),
              const SizedBox(height: 18), // clear separation from the strip below
              _CategoryStrip(cats: cats),
            ],
          ),
        ],
      ),
    );
  }

  // ---- brand row: diya + name + tagline + authentic pill ----
  Widget _brandRow() => Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 12, 2),
        child: Row(
          children: [
            const Text('🪔', style: TextStyle(fontSize: 26)),
            const SizedBox(width: 9),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Asktro Store',
                      style: TextStyle(fontFamily: 'serif', fontSize: 17, fontWeight: FontWeight.w800, color: _ink)),
                  SizedBox(height: 1),
                  Text('Divine essentials for a better you',
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 10.5, color: _muted, fontWeight: FontWeight.w500)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            // Authentic pill — no shield icon, compact single-line text.
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.9),
                borderRadius: BorderRadius.circular(11),
                boxShadow: [BoxShadow(color: _purpleDeep.withValues(alpha: 0.08), blurRadius: 8, offset: const Offset(0, 3))],
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('100% Authentic',
                      maxLines: 1, style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: _ink)),
                  Text('Energized & Blessed',
                      maxLines: 1, style: TextStyle(fontSize: 7.5, color: _muted, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ],
        ),
      );

  // ---- hero: headline + gold divider + subtext + CTA, product image ----
  Widget _heroBody(BuildContext context, String headline, String subtext, String cta, String image) {
    final words = headline.split(' ');
    final head = words.length > 1 ? words.sublist(0, words.length - 1).join(' ') : headline;
    final tail = words.length > 1 ? ' ${words.last}' : '';

    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 8, 12, 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            flex: 60,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                RichText(
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  text: TextSpan(
                    style: const TextStyle(fontFamily: 'serif', fontSize: 18.5, fontWeight: FontWeight.w700, height: 1.12, color: _ink),
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
                      // A richer, more visible gradient.
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFF9A6BE8), Color(0xFF6E4FB8), Color(0xFF463089)],
                      ),
                      borderRadius: BorderRadius.circular(22),
                      boxShadow: [BoxShadow(color: _purple.withValues(alpha: 0.42), blurRadius: 13, offset: const Offset(0, 6))],
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
          Expanded(flex: 40, child: _heroArt(image)),
        ],
      ),
    );
  }

  Widget _heroArt(String image) {
    if (image.isEmpty) {
      return SizedBox(
        height: 132,
        child: Center(
          child: Container(
            width: 100,
            height: 100,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(colors: [_purple.withValues(alpha: 0.16), _purple.withValues(alpha: 0.02)]),
            ),
            child: const Center(child: Text('🪔', style: TextStyle(fontSize: 40))),
          ),
        ),
      );
    }
    return SizedBox(
      height: 138,
      child: CachedNetworkImage(
        imageUrl: image,
        fit: BoxFit.contain,
        alignment: Alignment.bottomCenter,
        placeholder: (_, __) => const Center(
          child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.2, color: _purple)),
        ),
        errorWidget: (_, __, ___) => const Center(child: Text('🪔', style: TextStyle(fontSize: 38))),
      ),
    );
  }

}

/// The real category images in a gently auto-scrolling marquee (the "same flow"
/// the founder liked). The list is doubled so the loop is seamless; any touch
/// pauses the drift and hands scrolling back to the user.
class _CategoryStrip extends StatefulWidget {
  const _CategoryStrip({required this.cats});
  final List<StoreCategory> cats;

  @override
  State<_CategoryStrip> createState() => _CategoryStripState();
}

class _CategoryStripState extends State<_CategoryStrip> {
  final _ctrl = ScrollController();
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // Start drifting once laid out; only bother if there's more than a couple.
    WidgetsBinding.instance.addPostFrameCallback((_) => _startDrift());
  }

  void _startDrift() {
    _timer?.cancel();
    if (widget.cats.length < 3) return;
    // ~40px/sec continuous crawl; when we pass the first (real) copy, jump back
    // by that width so the doubled list reads as an endless loop.
    _timer = Timer.periodic(const Duration(milliseconds: 40), (_) {
      if (!_ctrl.hasClients) return;
      final max = _ctrl.position.maxScrollExtent;
      if (max <= 0) return;
      final half = max / 2;
      var next = _ctrl.offset + 1.6;
      if (next >= half) next -= half;
      _ctrl.jumpTo(next);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Double the list so the crawl can wrap seamlessly.
    final looped = [...widget.cats, ...widget.cats];
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.82),
        border: const Border(top: BorderSide(color: Color(0xFFEDE6FA))),
      ),
      child: SizedBox(
        height: 66,
        child: Listener(
          // A finger on the strip pauses the drift; it resumes after release.
          onPointerDown: (_) => _timer?.cancel(),
          onPointerUp: (_) => _startDrift(),
          child: ListView.separated(
            controller: _ctrl,
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            itemCount: looped.length,
            separatorBuilder: (_, __) => Container(
              width: 1,
              margin: const EdgeInsets.symmetric(vertical: 15),
              color: const Color(0xFFEBE3F8),
            ),
            itemBuilder: (_, i) => _CategoryChip(category: looped[i]),
          ),
        ),
      ),
    );
  }
}

/// Faint scattered stars behind the hero — the celestial ground.
class _Stars extends StatelessWidget {
  const _Stars();
  static const _pts = [
    [0.10, 0.22, 2.4, 0.5], [0.26, 0.10, 1.6, 0.35], [0.42, 0.30, 2.0, 0.4],
    [0.58, 0.12, 1.5, 0.3], [0.72, 0.26, 2.6, 0.5], [0.86, 0.14, 1.8, 0.4],
    [0.18, 0.44, 1.6, 0.3], [0.66, 0.42, 2.0, 0.35], [0.92, 0.38, 1.6, 0.3],
    [0.34, 0.18, 1.4, 0.28], [0.5, 0.05, 1.8, 0.35], [0.8, 0.5, 1.5, 0.3],
  ];
  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      return Stack(
        children: [
          for (final p in _pts)
            Positioned(
              left: p[0] * c.maxWidth,
              top: p[1] * (c.maxHeight.isFinite ? c.maxHeight : 200),
              child: Container(
                width: p[2],
                height: p[2],
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: (p[0] > 0.5 ? _gold : Colors.white).withValues(alpha: p[3]),
                ),
              ),
            ),
        ],
      );
    });
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
            SizedBox(width: 34, height: 34, child: _icon()),
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
    // The exact category images from the catalog (same source as the store rail).
    if (category.image.trim().isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(9),
        child: CachedNetworkImage(
          imageUrl: category.image.trim(),
          width: 34, height: 34, fit: BoxFit.cover,
          errorWidget: (_, __, ___) => _emojiFallback(),
        ),
      );
    }
    return _emojiFallback();
  }

  Widget _emojiFallback() => Container(
        decoration: BoxDecoration(color: _purple.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(9)),
        alignment: Alignment.center,
        child: Text(category.emoji.isNotEmpty ? category.emoji : '🪔', style: const TextStyle(fontSize: 16)),
      );
}
