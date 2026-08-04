import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import 'store_models.dart';
import 'store_providers.dart';

// Palette for the Zodia Mall hero — soft celestial lavender + purple + gold.
const _purple = Color(0xFF2B2417);
const _purpleDeep = Color(0xFF1A150C);
const _ink = Color(0xFF2B2140);
const _muted = Color(0xFF6E6689);
const _gold = Color(0xFFC79A33);
// Headline uses a very dark indigo-blue with a lighter purple accent on the
// last word, matching the reference.
const _navy = Color(0xFF120E07);
const _lilac = Color(0xFFA8791A);

/// Home-screen "Zodia Mall" hero — a single celestial card modeled on the
/// founder's reference: a white→lavender gradient ground with a faint lotus
/// mandala, bokeh dots and sparkles; the wordmark top-left and an authenticity
/// badge floating top-right; a headline / gold divider / subtext / Explore CTA
/// on the left with the product cluster centered on the right; and a *floating*
/// auto-scrolling category panel resting inside the card near the bottom. Hero
/// content (image/headline/subtext/CTA) is portal-managed via
/// `homeSections/storeHero`; categories from the catalog.
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
    final subtext = s('subtext', 'Our products bring peace & positivity.');
    final cta = s('cta', 'Explore Mall');
    final heroImage = (h['image'] ?? '').toString().trim();

    return Container(
      // Full-bleed to the screen edges (no side inset) with softly rounded
      // corners — a distinct band, not a tab sitting inside the feed. The extra
      // top/bottom spacing + the purple outline segregate it from the rails
      // above and the trust band below.
      margin: const EdgeInsets.fromLTRB(0, 14, 0, 16),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        // Visible purple outline + a soft purple glow so the Mall shines.
        border: Border.all(color: _purple.withValues(alpha: 0.40), width: 1.2),
        // Layered shadows for a raised, three-dimensional lift: a wide ambient
        // glow plus a tighter contact shadow that grounds the card.
        boxShadow: [
          BoxShadow(color: _purple.withValues(alpha: 0.20), blurRadius: 30, offset: const Offset(0, 16)),
          BoxShadow(color: _purpleDeep.withValues(alpha: 0.16), blurRadius: 10, offset: const Offset(0, 4)),
        ],
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
            top: 30,
            child: IgnorePointer(
              child: CustomPaint(size: const Size(220, 220), painter: _LotusMandalaPainter()),
            ),
          ),
          // Bokeh dots + sparkles, concentrated on the right so the copy stays clean.
          const Positioned.fill(child: IgnorePointer(child: _Celestial())),
          // Soft glossy highlight along the top edge — a subtle 3D sheen so the
          // card reads as a raised surface.
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: 46,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.white.withValues(alpha: 0.32), Colors.white.withValues(alpha: 0.0)],
                  ),
                ),
              ),
            ),
          ),
          Column(
            children: [
              _heroMiddle(context, headline, subtext, cta, heroImage),
              const SizedBox(height: 12),
              _CategoryStrip(cats: cats),
              const SizedBox(height: 12), // bottom inset so the panel floats
            ],
          ),
        ],
      ),
    );
  }

  // ---- middle band: text on the left, big product art centered on the right,
  // authenticity badge floating in the top-right corner (like the reference) ----
  Widget _heroMiddle(BuildContext context, String headline, String subtext, String cta, String image) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 0, 0),
      child: Stack(
        children: [
          // Bottom-align both sides so the product sits on the floor and rises
          // to meet the badge — the left text is kept compact to match its
          // height (like the reference).
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(flex: 42, child: _leftColumn(context, headline, subtext, cta)),
              Expanded(
                flex: 58,
                // The product sizes to its own column (never a scale transform —
                // that paints outside the box and overlaps the text). A small
                // nudge lets it kiss the bottom-right card edge (clipped there),
                // so it stays clear of the copy on the left.
                child: Transform.translate(
                  offset: const Offset(10, 6),
                  child: Align(alignment: Alignment.bottomRight, child: _HeroArt(image: image)),
                ),
              ),
            ],
          ),
          // Authenticity badge floats over the top-right corner.
          Positioned(top: 0, right: 12, child: _badge()),
        ],
      ),
    );
  }

  Widget _leftColumn(BuildContext context, String headline, String subtext, String cta) {
    final words = headline.split(' ');
    final head = words.length > 1 ? words.sublist(0, words.length - 1).join(' ') : headline;
    final tail = words.length > 1 ? ' ${words.last}' : '';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Two-tone wordmark — no icon, left-aligned.
        RichText(
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          text: const TextSpan(
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, letterSpacing: -0.3),
            children: [
              TextSpan(text: 'Zodia ', style: TextStyle(color: _navy)),
              TextSpan(text: 'Mall', style: TextStyle(color: _purple)),
            ],
          ),
        ),
        const SizedBox(height: 1),
        const Text('Divine essentials for you',
            maxLines: 1, overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 10, color: _muted, fontWeight: FontWeight.w500),),
        const SizedBox(height: 12),
        RichText(
          maxLines: 3,
          overflow: TextOverflow.ellipsis,
          text: TextSpan(
            style: const TextStyle(fontFamily: 'serif', fontSize: 16, fontWeight: FontWeight.w700, height: 1.15, color: _navy),
            children: [
              TextSpan(text: head),
              TextSpan(text: tail, style: const TextStyle(color: _lilac)),
            ],
          ),
        ),
        const SizedBox(height: 9),
        Row(
          children: [
            Container(width: 26, height: 1.5, color: _gold.withValues(alpha: 0.75)),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 5),
              child: Icon(Icons.auto_awesome, size: 9, color: _gold),
            ),
            Container(width: 12, height: 1.5, color: _gold.withValues(alpha: 0.35)),
          ],
        ),
        const SizedBox(height: 8),
        Text(subtext,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 10.5, color: _muted, height: 1.3, fontWeight: FontWeight.w500),),
        const SizedBox(height: 11),
        GestureDetector(
          onTap: () => context.push('/store'),
          child: Container(
            padding: const EdgeInsets.fromLTRB(15, 9, 8, 9),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
                colors: [Color(0xFF8A5FDD), Color(0xFF2B2417), Color(0xFF4E3596)],
              ),
              borderRadius: BorderRadius.circular(24),
              boxShadow: [BoxShadow(color: _purple.withValues(alpha: 0.40), blurRadius: 14, offset: const Offset(0, 6))],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Text(cta,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w800),),
                ),
                const SizedBox(width: 8),
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
    );
  }

  Widget _badge() => Container(
        padding: const EdgeInsets.fromLTRB(9, 7, 11, 7),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.94),
          borderRadius: BorderRadius.circular(12),
          boxShadow: [BoxShadow(color: _purpleDeep.withValues(alpha: 0.10), blurRadius: 9, offset: const Offset(0, 3))],
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
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: _purple),),
                SizedBox(height: 1),
                Text('Energized & Blessed',
                    maxLines: 1, softWrap: false, overflow: TextOverflow.visible,
                    style: TextStyle(fontSize: 8, color: _muted, fontWeight: FontWeight.w600),),
              ],
            ),
          ],
        ),
      );

}

/// The product art — auto-sized to whatever image is set. It reads the image's
/// *real* aspect ratio (from the decoded image), so a square or tall portal
/// upload fills the slot correctly instead of letterboxing inside a fixed
/// landscape box. Width is capped to the column and height to [_targetH] so a
/// tall image can never blow up the card; it's bottom-right anchored.
class _HeroArt extends StatefulWidget {
  const _HeroArt({required this.image});
  final String image; // network URL; empty => bundled default asset

  @override
  State<_HeroArt> createState() => _HeroArtState();
}

class _HeroArtState extends State<_HeroArt> {
  static const _fallbackRatio = 1169 / 730; // the bundled product PNG's ratio
  static const _targetH = 172.0;
  double? _ratio;
  ImageStream? _stream;
  ImageStreamListener? _listener;

  @override
  void initState() {
    super.initState();
    _resolve();
  }

  @override
  void didUpdateWidget(covariant _HeroArt old) {
    super.didUpdateWidget(old);
    if (old.image != widget.image) {
      _ratio = null;
      _resolve();
    }
  }

  // Bundled product art — a light (~200 KB) transparent WebP, decoded at the
  // display height so it paints instantly and doubles as the network
  // placeholder.
  static const _assetPath = 'assets/store/hero_products.webp';

  ImageProvider get _provider => widget.image.isEmpty
      ? const AssetImage(_assetPath)
      : CachedNetworkImageProvider(widget.image);

  // Listen once for the decoded image to learn its true width/height ratio.
  void _resolve() {
    final oldStream = _stream;
    final oldListener = _listener;
    final stream = _provider.resolve(const ImageConfiguration());
    final listener = ImageStreamListener((info, _) {
      final r = info.image.width / info.image.height;
      if (mounted && r > 0 && _ratio != r) setState(() => _ratio = r);
    }, onError: (_, __) {},);
    stream.addListener(listener);
    _stream = stream;
    _listener = listener;
    if (oldStream != null && oldListener != null) oldStream.removeListener(oldListener);
  }

  @override
  void dispose() {
    if (_stream != null && _listener != null) _stream!.removeListener(_listener!);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ratio = (_ratio == null || _ratio! <= 0) ? _fallbackRatio : _ratio!;
    // Decode at ~2× the display height (172pt) so even high-DPI screens stay
    // crisp while the decode stays cheap — this is what removes the load lag.
    const decodeH = 360;
    final Widget img = widget.image.isEmpty
        ? Image.asset(
            _assetPath,
            fit: BoxFit.contain,
            alignment: Alignment.bottomRight,
            cacheHeight: decodeH,
            errorBuilder: (_, __, ___) => const Center(child: Text('🪔', style: TextStyle(fontSize: 44))),
          )
        : CachedNetworkImage(
            imageUrl: widget.image,
            fit: BoxFit.contain,
            alignment: Alignment.bottomRight,
            memCacheHeight: decodeH,
            maxHeightDiskCache: decodeH,
            fadeInDuration: const Duration(milliseconds: 180),
            // Show the bundled product instantly while the network image loads,
            // so the hero is never blank or spinning.
            placeholder: (_, __) => Image.asset(
              _assetPath,
              fit: BoxFit.contain,
              alignment: Alignment.bottomRight,
              cacheHeight: decodeH,
            ),
            errorWidget: (_, __, ___) => Image.asset(
              _assetPath,
              fit: BoxFit.contain,
              alignment: Alignment.bottomRight,
              cacheHeight: decodeH,
            ),
          );
    return LayoutBuilder(
      builder: (context, c) {
        final maxW = c.maxWidth.isFinite ? c.maxWidth : 190.0;
        // Size to the image's ratio: prefer a target height, but never exceed
        // the column width (so it can't cross into the copy on the left).
        var w = _targetH * ratio;
        if (w > maxW) w = maxW;
        final h = w / ratio;
        return SizedBox(width: w, height: h, child: img);
      },
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

class _CategoryStripState extends State<_CategoryStrip>
    with SingleTickerProviderStateMixin {
  // A single vsync-driven controller. The chip row is built ONCE and never
  // relaid-out; each frame only moves a Transform (one composited layer) — so
  // the marquee costs a GPU shift, not a 25×/sec list re-scroll on the home
  // screen. The panel reserves its 60px height statically; the motion rides on
  // top inside the clip.
  late final AnimationController _ac;
  // Width of ONE set of chips. Two identical sets are laid back-to-back and the
  // row slides left by exactly one set, so the loop is seamless.
  double _setWidth = 0;
  final GlobalKey _measureKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    // ~30px/sec gentle drift regardless of how many categories there are.
    _ac = AnimationController(vsync: this, duration: const Duration(seconds: 24))
      ..repeat();
    WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
  }

  void _measure() {
    if (!mounted) return;
    final w = _measureKey.currentContext?.size?.width ?? 0;
    if (w > 0 && (w - _setWidth).abs() > 0.5) setState(() => _setWidth = w);
  }

  @override
  void didUpdateWidget(covariant _CategoryStrip old) {
    super.didUpdateWidget(old);
    if (old.cats.length != widget.cats.length) {
      _setWidth = 0;
      WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
    }
  }

  @override
  void dispose() {
    _ac.dispose();
    super.dispose();
  }

  static Widget _divider() => Container(
        width: 1,
        margin: const EdgeInsets.symmetric(vertical: 13),
        color: const Color(0xFFEBE3F8),
      );

  // One set of chips with 1px dividers between them (no leading/trailing one).
  List<Widget> _oneSet() {
    final out = <Widget>[];
    for (var i = 0; i < widget.cats.length; i++) {
      if (i > 0) out.add(_divider());
      out.add(_CategoryChip(category: widget.cats[i]));
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final canLoop = widget.cats.length >= 3;
    Widget inner;
    if (!canLoop) {
      // Too few to bother looping — a plain, static, tappable row.
      inner = ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        children: _oneSet(),
      );
    } else if (_setWidth == 0) {
      // Measure pass: lay one set at its natural width (unconstrained) so we can
      // read its real width, then switch to the animated two-set row next frame.
      inner = ClipRect(
        child: OverflowBox(
          minWidth: 0,
          maxWidth: double.infinity,
          alignment: Alignment.centerLeft,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: Row(key: _measureKey, mainAxisSize: MainAxisSize.min, children: _oneSet()),
          ),
        ),
      );
    } else {
      // Steady state: two identical sets, translated left by (one set + the seam
      // divider). The Row is the AnimatedBuilder's `child`, so it is built once;
      // only the Transform recomputes per frame.
      final loop = _setWidth + 1;
      inner = ClipRect(
        child: OverflowBox(
          minWidth: 0,
          maxWidth: double.infinity,
          alignment: Alignment.centerLeft,
          child: Padding(
            padding: const EdgeInsets.only(left: 6),
            child: AnimatedBuilder(
              animation: _ac,
              builder: (_, child) =>
                  Transform.translate(offset: Offset(-_ac.value * loop, 0), child: child),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [..._oneSet(), _divider(), ..._oneSet()],
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.82),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _purple.withValues(alpha: 0.38), width: 1.2),
        // Raised 3D feel: a drop shadow to lift it off the card + a faint top
        // highlight so it reads like a panel floating above the surface.
        boxShadow: [
          BoxShadow(color: _purpleDeep.withValues(alpha: 0.14), blurRadius: 16, offset: const Offset(0, 8)),
          BoxShadow(color: Colors.white.withValues(alpha: 0.5), blurRadius: 5, offset: const Offset(0, -2)),
        ],
      ),
      child: SizedBox(height: 60, child: inner),
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
    },);
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
            SizedBox(width: 32, height: 32, child: _icon(context)),
            const SizedBox(width: 8),
            Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(category.name,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: _ink),),
                if (blurb.isNotEmpty)
                  Text(blurb,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 10, color: _muted, fontWeight: FontWeight.w500),),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _icon(BuildContext context) {
    // The exact category images from the catalog (same source as the store rail).
    if (category.image.trim().isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(9),
        child: CachedNetworkImage(
          imageUrl: category.image.trim(),
          width: 32, height: 32, fit: BoxFit.cover,
          // Decode to the 32px box, not the full 1600px source.
          memCacheWidth: (32 * MediaQuery.devicePixelRatioOf(context)).round(),
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
