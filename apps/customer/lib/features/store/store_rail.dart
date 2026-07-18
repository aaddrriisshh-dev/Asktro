import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import 'store_models.dart';
import 'store_providers.dart';

// Palette for the Asktro Mall hero — soft celestial lavender + purple + gold.
const _purple = Color(0xFF6E4FB8);
const _purpleDeep = Color(0xFF463089);
const _ink = Color(0xFF2B2140);
const _muted = Color(0xFF6E6689);
const _gold = Color(0xFFC79A33);
// Headline uses a very dark indigo-blue with a lighter purple accent on the
// last word, matching the reference.
const _navy = Color(0xFF221C4A);
const _lilac = Color(0xFF9173D6);

/// Home-screen "Asktro Store" hero — a single celestial card modeled on the
/// founder's reference: a white→lavender gradient ground with a faint lotus
/// mandala, bokeh dots and sparkles; a brand row + authenticity badge; a
/// headline / gold divider / subtext / Explore CTA on the left with the product
/// cluster on the right; and a *floating* auto-scrolling category panel resting
/// inside the card near the bottom. Hero content (image/headline/subtext/CTA)
/// is portal-managed via `homeSections/storeHero`; categories from the catalog.
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
    final subtext = s('subtext', 'Handpicked spiritual products to bring peace, positivity & prosperity.');
    final cta = s('cta', 'Explore Mall');
    final heroImage = (h['image'] ?? '').toString().trim();

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFEADFF9)),
        boxShadow: [BoxShadow(color: _purpleDeep.withValues(alpha: 0.12), blurRadius: 24, offset: const Offset(0, 12))],
        // White (top-left) → minimal lavender → deeper lavender (bottom-right),
        // deepening toward the products, exactly like the reference.
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFCFBFF), Color(0xFFF2EBFC), Color(0xFFE4D4F6)],
          stops: [0.0, 0.5, 1.0],
        ),
      ),
      child: Stack(
        children: [
          // Faint WHITE lotus mandala with a galaxy ring behind the product
          // cluster (right side) — drawn, so it carries no dark colours.
          Positioned(
            right: -34,
            top: 34,
            child: IgnorePointer(
              child: CustomPaint(size: const Size(220, 220), painter: _LotusMandalaPainter()),
            ),
          ),
          // Bokeh dots + sparkles, concentrated on the right so the copy stays clean.
          const Positioned.fill(child: IgnorePointer(child: _Celestial())),
          Column(
            children: [
              _brandRow(),
              _heroBody(context, headline, subtext, cta, heroImage),
              const SizedBox(height: 14),
              _CategoryStrip(cats: cats),
              const SizedBox(height: 12), // bottom inset so the panel floats
            ],
          ),
        ],
      ),
    );
  }

  // ---- brand row: bag tile + name + tagline + authenticity badge ----
  Widget _brandRow() => Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 12, 2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
            // Purple rounded tile with a white shopping-bag glyph (reference).
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF8A5FDD), Color(0xFF6E4FB8), Color(0xFF4E3596)],
                ),
                borderRadius: BorderRadius.circular(12),
                boxShadow: [BoxShadow(color: _purple.withValues(alpha: 0.38), blurRadius: 10, offset: const Offset(0, 5))],
              ),
              child: const Icon(Icons.shopping_bag_outlined, color: Colors.white, size: 21),
            ),
            const SizedBox(width: 10),
            // Wordmark takes the row; the tagline gets its own full-width line
            // below so it always shows complete (a badge would otherwise crowd
            // it on a narrow phone).
            const Expanded(
              child: Text('Asktro Mall',
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: _navy, letterSpacing: -0.3)),
            ),
            const SizedBox(width: 8),
            // Authenticity badge — rounded white panel: outline shield + check,
            // purple headline over a grey line.
            Container(
              padding: const EdgeInsets.fromLTRB(9, 7, 11, 7),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.94),
                borderRadius: BorderRadius.circular(12),
                boxShadow: [BoxShadow(color: _purpleDeep.withValues(alpha: 0.08), blurRadius: 9, offset: const Offset(0, 3))],
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.gpp_good_outlined, size: 17, color: _purple),
                  SizedBox(width: 6),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('100% Authentic',
                          maxLines: 1, softWrap: false, overflow: TextOverflow.visible,
                          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: _purple)),
                      SizedBox(height: 1),
                      Text('Energized & Blessed',
                          maxLines: 1, softWrap: false, overflow: TextOverflow.visible,
                          style: TextStyle(fontSize: 8, color: _muted, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ],
              ),
              ],
            ),
            const Padding(
              padding: EdgeInsets.only(left: 48, top: 2),
              child: Text('Divine essentials for a better you',
                  maxLines: 1, softWrap: false, overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 10.5, color: _muted, fontWeight: FontWeight.w500)),
            ),
          ],
        ),
      );

  // ---- hero: headline + gold divider + subtext + CTA on the left, art right ----
  Widget _heroBody(BuildContext context, String headline, String subtext, String cta, String image) {
    final words = headline.split(' ');
    final head = words.length > 1 ? words.sublist(0, words.length - 1).join(' ') : headline;
    final tail = words.length > 1 ? ' ${words.last}' : '';

    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 6, 10, 0),
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
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  text: TextSpan(
                    style: const TextStyle(fontFamily: 'serif', fontSize: 17.5, fontWeight: FontWeight.w700, height: 1.16, color: _navy),
                    children: [
                      TextSpan(text: head),
                      TextSpan(text: tail, style: const TextStyle(color: _lilac)),
                    ],
                  ),
                ),
                const SizedBox(height: 9),
                Row(
                  children: [
                    Container(width: 30, height: 1.5, color: _gold.withValues(alpha: 0.75)),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 5),
                      child: Icon(Icons.auto_awesome, size: 10, color: _gold),
                    ),
                    Container(width: 14, height: 1.5, color: _gold.withValues(alpha: 0.35)),
                  ],
                ),
                const SizedBox(height: 9),
                Text(subtext,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11.5, color: _muted, height: 1.35, fontWeight: FontWeight.w500)),
                const SizedBox(height: 13),
                GestureDetector(
                  onTap: () => context.push('/store'),
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(16, 9, 8, 9),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        begin: Alignment.centerLeft,
                        end: Alignment.centerRight,
                        colors: [Color(0xFF8A5FDD), Color(0xFF6E4FB8), Color(0xFF4E3596)],
                      ),
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [BoxShadow(color: _purple.withValues(alpha: 0.40), blurRadius: 14, offset: const Offset(0, 6))],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(cta,
                            style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w800)),
                        const SizedBox(width: 9),
                        Container(
                          width: 22,
                          height: 22,
                          decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                          child: const Icon(Icons.arrow_forward_rounded, size: 13, color: _purple),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 4),
          Expanded(flex: 40, child: _heroArt(image)),
        ],
      ),
    );
  }

  Widget _heroArt(String image) {
    if (image.isEmpty) {
      // Stand-in until the founder uploads the transparent product PNG.
      return SizedBox(
        height: 150,
        child: Center(
          child: Container(
            width: 108,
            height: 108,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(colors: [_purple.withValues(alpha: 0.16), _purple.withValues(alpha: 0.02)]),
            ),
            child: const Center(child: Text('🪔', style: TextStyle(fontSize: 44))),
          ),
        ),
      );
    }
    return SizedBox(
      height: 156,
      child: CachedNetworkImage(
        imageUrl: image,
        fit: BoxFit.contain,
        alignment: Alignment.bottomCenter,
        placeholder: (_, __) => const Center(
          child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.2, color: _purple)),
        ),
        errorWidget: (_, __, ___) => const Center(child: Text('🪔', style: TextStyle(fontSize: 40))),
      ),
    );
  }
}

/// A *floating* category panel — the real catalog images in a gently
/// auto-scrolling marquee, resting inside the card (inset margins, rounded,
/// translucent white, soft shadow) exactly like the reference. The list is
/// doubled for a seamless loop; a finger pauses the drift.
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
    WidgetsBinding.instance.addPostFrameCallback((_) => _startDrift());
  }

  void _startDrift() {
    _timer?.cancel();
    if (widget.cats.length < 3) return;
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
    final looped = [...widget.cats, ...widget.cats];
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.74),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.7)),
        boxShadow: [BoxShadow(color: _purpleDeep.withValues(alpha: 0.10), blurRadius: 14, offset: const Offset(0, 6))],
      ),
      child: SizedBox(
        height: 60,
        child: Listener(
          onPointerDown: (_) => _timer?.cancel(),
          onPointerUp: (_) => _startDrift(),
          child: ListView.separated(
            controller: _ctrl,
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 6),
            itemCount: looped.length,
            separatorBuilder: (_, __) => Container(
              width: 1,
              margin: const EdgeInsets.symmetric(vertical: 13),
              color: const Color(0xFFEBE3F8),
            ),
            itemBuilder: (_, i) => _CategoryChip(category: looped[i]),
          ),
        ),
      ),
    );
  }
}

/// Bokeh dots + four-point sparkles — the celestial ground. Kept to the right
/// half so the headline stays clean; brighter/crisper than a faint wash so the
/// starfield reads clearly, mirroring the reference.
class _Celestial extends StatelessWidget {
  const _Celestial();
  // white bokeh dots: x, y (fractions), diameter, opacity
  static const _dots = [
    [0.46, 0.14, 4.0, 0.75], [0.55, 0.30, 2.5, 0.60], [0.40, 0.46, 3.0, 0.55],
    [0.62, 0.10, 3.0, 0.70], [0.70, 0.50, 2.5, 0.55], [0.33, 0.24, 2.0, 0.55],
    [0.76, 0.30, 3.5, 0.60], [0.50, 0.58, 2.0, 0.50], [0.86, 0.20, 2.5, 0.55],
  ];
  // sparkles: x, y, font-size, opacity (bright white, crisp)
  static const _sparks = [
    [0.44, 0.07, 12.0, 0.85], [0.58, 0.22, 9.0, 0.70], [0.67, 0.40, 11.0, 0.72],
    [0.36, 0.34, 8.0, 0.62], [0.73, 0.13, 10.0, 0.78], [0.52, 0.48, 8.0, 0.58],
    [0.83, 0.44, 9.0, 0.65], [0.30, 0.12, 8.0, 0.60],
  ];
  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final h = c.maxHeight.isFinite ? c.maxHeight : 280.0;
      return Stack(
        children: [
          for (final d in _dots)
            Positioned(
              left: d[0] * c.maxWidth,
              top: d[1] * h,
              child: Container(
                width: d[2],
                height: d[2],
                decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: d[3])),
              ),
            ),
          for (final p in _sparks)
            Positioned(
              left: p[0] * c.maxWidth,
              top: p[1] * h,
              child: Text(
                '✦',
                style: TextStyle(
                  fontSize: p[2],
                  height: 1,
                  color: Colors.white.withValues(alpha: p[3]),
                  shadows: [Shadow(color: _purple.withValues(alpha: 0.25 * p[3]), blurRadius: 4)],
                ),
              ),
            ),
        ],
      );
    });
  }
}

/// A white lotus-mandala with a faint galaxy ring — drawn (no dark colours) so
/// it sits behind the products as a bright, airy watermark.
class _LotusMandalaPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size s) {
    final c = Offset(s.width / 2, s.height / 2);
    final petal = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.1
      ..strokeJoin = StrokeJoin.round
      ..color = Colors.white.withValues(alpha: 0.60);

    void ring(int n, double inner, double outer, double width) {
      for (var i = 0; i < n; i++) {
        canvas.save();
        canvas.translate(c.dx, c.dy);
        canvas.rotate(i * 2 * math.pi / n);
        final path = Path()
          ..moveTo(0, -inner)
          ..cubicTo(width, -(inner + outer) / 2, width, -outer, 0, -outer)
          ..cubicTo(-width, -outer, -width, -(inner + outer) / 2, 0, -inner);
        canvas.drawPath(path, petal);
        canvas.restore();
      }
    }

    ring(18, s.width * 0.10, s.width * 0.46, s.width * 0.135);
    ring(18, s.width * 0.05, s.width * 0.27, s.width * 0.085);

    // Faint galaxy rings + a small core.
    final glow = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.8
      ..color = Colors.white.withValues(alpha: 0.30);
    canvas.drawCircle(c, s.width * 0.50, glow);
    canvas.drawCircle(c, s.width * 0.40, glow..color = Colors.white.withValues(alpha: 0.18));
    canvas.drawCircle(c, s.width * 0.05, Paint()..color = Colors.white.withValues(alpha: 0.5));
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
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
            SizedBox(width: 32, height: 32, child: _icon()),
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
          width: 32, height: 32, fit: BoxFit.cover,
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
