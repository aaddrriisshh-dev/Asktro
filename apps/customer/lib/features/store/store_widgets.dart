import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import 'store_models.dart';
import 'store_theme.dart';

/// Product image with a warm ghee placeholder while loading / when absent.
class MallImage extends StatelessWidget {
  const MallImage({super.key, required this.url, this.size = 48, this.radius = 16, this.fit = BoxFit.cover});
  final String? url;
  final double size;
  final double radius;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    if (url == null || url!.isEmpty) {
      return MallImagePlaceholder(size: size, radius: radius);
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: CachedNetworkImage(
        imageUrl: url!,
        fit: fit,
        placeholder: (_, __) => MallImagePlaceholder(size: size, radius: radius),
        errorWidget: (_, __, ___) => MallImagePlaceholder(size: size, radius: radius),
      ),
    );
  }
}

/// A small green price + struck-through MRP + "% OFF" chip row.
class PriceRow extends StatelessWidget {
  const PriceRow({super.key, required this.product, this.big = false});
  final StoreProduct product;
  final bool big;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 7,
      runSpacing: 4,
      children: [
        Text(Mall.rupees(product.pricePaise),
            style: TextStyle(fontSize: big ? 22 : 16, fontWeight: FontWeight.w800, color: Mall.green),),
        if (product.hasDiscount)
          Text(Mall.rupees(product.mrpPaise),
              style: TextStyle(
                  fontSize: big ? 14 : 12,
                  color: Mall.mrp,
                  decoration: TextDecoration.lineThrough,),),
        if (product.hasDiscount)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(color: Mall.offBg, borderRadius: BorderRadius.circular(6)),
            child: Text('${product.discountPercent}% OFF',
                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Mall.offInk),),
          ),
      ],
    );
  }
}

/// Compact, image-first product card (Asktro Mall). The photo is dominant with a
/// rating badge and a discount ribbon on it; below sits a one-line title and a
/// tight price row with a small gold "+" add button.
class ProductCard extends StatelessWidget {
  const ProductCard({super.key, required this.product, required this.onTap, required this.onAdd, this.ribbon});
  final StoreProduct product;
  final VoidCallback onTap;
  final VoidCallback onAdd;

  /// Overrides the corner ribbon (e.g. 'NEW', 'COMBO'); defaults to the % OFF.
  final ({String text, Color color})? ribbon;

  @override
  Widget build(BuildContext context) {
    final override = ribbon; // NEW / COMBO ribbon, if any
    final savings = product.mrpPaise - product.pricePaise;
    final showSavings = override == null && product.hasDiscount && savings > 0;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Mall.card,
          borderRadius: BorderRadius.circular(15),
          border: Border.all(color: const Color(0xFFECE1C8)),
          boxShadow: [BoxShadow(color: const Color(0xFF5A3C0A).withValues(alpha: 0.16), blurRadius: 22, offset: const Offset(0, 12))],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            AspectRatio(
              aspectRatio: 1,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  DecoratedBox(
                    decoration: const BoxDecoration(
                      gradient: RadialGradient(
                        center: Alignment(0, -0.35), radius: 0.95,
                        colors: [Colors.white, Color(0xFFF4ECDC)],
                      ),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(10),
                      child: MallImage(url: product.image, size: 46, radius: 12),
                    ),
                  ),
                  if (override != null)
                    Positioned(
                      left: 0, top: 9,
                      child: Container(
                        padding: const EdgeInsets.fromLTRB(7, 3, 8, 3),
                        decoration: BoxDecoration(color: override.color, borderRadius: const BorderRadius.horizontal(right: Radius.circular(8))),
                        child: Text(override.text, style: const TextStyle(fontSize: 8.5, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: 0.2)),
                      ),
                    )
                  else if (showSavings)
                    // Savings tag — dark ghee ground with gold ink (badge "5").
                    Positioned(
                      left: 0, top: 9,
                      child: Container(
                        padding: const EdgeInsets.fromLTRB(8, 3, 9, 3),
                        decoration: const BoxDecoration(
                          color: Color(0xFF33240F),
                          borderRadius: BorderRadius.horizontal(right: Radius.circular(9)),
                          boxShadow: [BoxShadow(color: Color(0x66281A08), blurRadius: 7, offset: Offset(0, 3))],
                        ),
                        child: Text('${Mall.rupees(savings)} OFF',
                            style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: Mall.gold, letterSpacing: 0.2)),
                      ),
                    ),
                  Positioned(
                    right: 8, bottom: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.96),
                        borderRadius: BorderRadius.circular(9),
                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.22), blurRadius: 6, offset: const Offset(0, 2))],
                      ),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.star_rounded, size: 12, color: Color(0xFFE0A92E)),
                        const SizedBox(width: 2),
                        Text(product.rating.toStringAsFixed(1),
                            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Color(0xFF2B2412)),),
                      ],),
                    ),
                  ),
                  if (!product.inStock)
                    Positioned.fill(
                      child: Container(
                        color: Colors.white.withValues(alpha: 0.6),
                        alignment: Alignment.center,
                        child: const Text('Out of stock', style: TextStyle(fontWeight: FontWeight.w700, color: Mall.ink)),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(11, 9, 11, 11),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(product.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Mall.navy),),
                  const SizedBox(height: 6),
                  Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 5,
                    children: [
                      Text(Mall.rupees(product.pricePaise),
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Mall.green),),
                      if (product.hasDiscount)
                        Text(Mall.rupees(product.mrpPaise),
                            style: const TextStyle(fontSize: 10.5, color: Mall.mrp, decoration: TextDecoration.lineThrough),),
                    ],
                  ),
                  const SizedBox(height: 9),
                  // Add to Cart — near-black ground, gold cart, white label (button "B").
                  GestureDetector(
                    onTap: product.inStock ? onAdd : null,
                    child: Container(
                      height: 34,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: product.inStock ? const Color(0xFF1C160C) : Mall.mrp,
                        borderRadius: BorderRadius.circular(11),
                        boxShadow: product.inStock
                            ? [BoxShadow(color: const Color(0xFF1C160C).withValues(alpha: 0.35), blurRadius: 10, offset: const Offset(0, 5))]
                            : null,
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.shopping_cart_outlined, size: 15, color: product.inStock ? Mall.gold : Colors.white70),
                          const SizedBox(width: 7),
                          Text(product.inStock ? 'ADD TO CART' : 'OUT OF STOCK',
                              style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 0.4, color: Colors.white)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A continuously-scrolling "claim strip" marquee (dark band, gold accents).
///
/// The phrase row is laid out once at its natural width, measured after the
/// first frame, then two copies are translated left by that measured width so
/// the loop is seamless with a constant pixel-per-second speed regardless of
/// how long the phrase list is. (The earlier version forced each copy into a
/// screen-width box, so long content overflowed and overlapped.)
class ClaimMarquee extends StatefulWidget {
  const ClaimMarquee({super.key, required this.phrases});
  final List<String> phrases;

  @override
  State<ClaimMarquee> createState() => _ClaimMarqueeState();
}

class _ClaimMarqueeState extends State<ClaimMarquee> with SingleTickerProviderStateMixin {
  // Needs a valid duration BEFORE repeat() — a null-duration repeat() throws
  // (in release that surfaces as a gray error box that swallows the page). The
  // real, width-based duration is applied in _measure() once we know the width.
  late final AnimationController _c;
  final GlobalKey _rowKey = GlobalKey();
  double _rowWidth = 0;

  static const double _pxPerSecond = 45; // steady, readable scroll speed

  @override
  void initState() {
    super.initState();
    // Build the controller here, not as a `late` field initializer: if the
    // widget is unmounted before it ever builds, a lazy initializer would run
    // for the first time inside dispose(), where repeat() hits a torn-down
    // ticker and crashes ("Null check operator used on a null value").
    _c = AnimationController(vsync: this, duration: const Duration(seconds: 12))..repeat();
    WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
  }

  void _measure() {
    final ctx = _rowKey.currentContext;
    if (ctx == null) return;
    final w = ctx.size?.width ?? 0;
    if (w > 0 && (w - _rowWidth).abs() > 0.5) {
      setState(() {
        _rowWidth = w;
        _c.duration = Duration(milliseconds: (w / _pxPerSecond * 1000).round());
        _c
          ..reset()
          ..repeat();
      });
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Widget _buildRow({Key? key}) {
    return Row(
      key: key,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final p in widget.phrases) ...[
          const Padding(padding: EdgeInsets.symmetric(horizontal: 10), child: Icon(Icons.auto_awesome, size: 11, color: Mall.gold)),
          Text(p, style: const TextStyle(color: Color(0xFFF3E7CF), fontSize: 11, fontWeight: FontWeight.w600)),
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    // Re-measure in case phrase content / text scale changed.
    WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
    return Container(
      height: 34,
      decoration: const BoxDecoration(
        gradient: LinearGradient(colors: [Color(0xFF241A0E), Color(0xFF3A2C16), Color(0xFF241A0E)]),
      ),
      clipBehavior: Clip.hardEdge,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final dx = _rowWidth == 0 ? 0.0 : -_c.value * _rowWidth;
          return OverflowBox(
            alignment: Alignment.centerLeft,
            minWidth: 0,
            maxWidth: double.infinity,
            child: Transform.translate(
              offset: Offset(dx, 0),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildRow(key: _rowKey),
                  _buildRow(),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// A little gold star row used on testimonials.
class StarRow extends StatelessWidget {
  const StarRow({super.key, required this.rating, this.size = 14});
  final double rating;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < 5; i++)
          Icon(
            i < rating.round() ? Icons.star_rounded : Icons.star_outline_rounded,
            size: size,
            color: const Color(0xFFE0A92E),
          ),
      ],
    );
  }
}

/// A single social-proof card (avatar, name+place, stars, quote).
class TestimonialCard extends StatelessWidget {
  const TestimonialCard({super.key, required this.t});
  final StoreTestimonial t;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 268,
      padding: const EdgeInsets.fromLTRB(16, 15, 16, 16),
      decoration: BoxDecoration(
        color: Mall.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFECE1C8)),
        boxShadow: [BoxShadow(color: const Color(0xFF5A3C0A).withValues(alpha: 0.12), blurRadius: 18, offset: const Offset(0, 8))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: const BoxDecoration(shape: BoxShape.circle),
                clipBehavior: Clip.antiAlias,
                child: MallImage(url: t.avatar, size: 22, radius: 21),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(t.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Mall.ink),),
                    if (t.location.isNotEmpty)
                      Text(t.location, style: const TextStyle(fontSize: 11, color: Mall.warmGrey)),
                  ],
                ),
              ),
              const Icon(Icons.format_quote_rounded, size: 22, color: Mall.goldLine),
            ],
          ),
          const SizedBox(height: 10),
          StarRow(rating: t.rating),
          const SizedBox(height: 8),
          Text(
            t.quote,
            maxLines: 4,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12.5, height: 1.4, color: Color(0xFF5A4B2E)),
          ),
        ],
      ),
    );
  }
}

/// An expandable FAQ row (celestial-warm, no divider noise).
class FaqTile extends StatefulWidget {
  const FaqTile({super.key, required this.faq});
  final StoreFaq faq;

  @override
  State<FaqTile> createState() => _FaqTileState();
}

class _FaqTileState extends State<FaqTile> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Mall.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFEDE3CC)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          InkWell(
            onTap: () => setState(() => _open = !_open),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(15, 14, 12, 14),
              child: Row(
                children: [
                  Expanded(
                    child: Text(widget.faq.question,
                        style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Mall.ink),),
                  ),
                  const SizedBox(width: 8),
                  AnimatedRotation(
                    turns: _open ? 0.5 : 0,
                    duration: const Duration(milliseconds: 180),
                    child: const Icon(Icons.keyboard_arrow_down_rounded, color: Mall.goldInk),
                  ),
                ],
              ),
            ),
          ),
          AnimatedCrossFade(
            firstChild: const SizedBox(width: double.infinity),
            secondChild: Padding(
              padding: const EdgeInsets.fromLTRB(15, 0, 15, 15),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(widget.faq.answer,
                    style: const TextStyle(fontSize: 12.5, height: 1.5, color: Color(0xFF6A5A3C)),),
              ),
            ),
            crossFadeState: _open ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 180),
          ),
        ],
      ),
    );
  }
}

/// A larger, image-led category card for the "Shop by Category" grid.
class StoreCategoryCard extends StatelessWidget {
  const StoreCategoryCard({super.key, required this.category, required this.onTap});
  final StoreCategory category;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Mall.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFECE1C8)),
          boxShadow: [BoxShadow(color: const Color(0xFF5A3C0A).withValues(alpha: 0.10), blurRadius: 14, offset: const Offset(0, 6))],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: DecoratedBox(
                decoration: const BoxDecoration(
                  gradient: RadialGradient(center: Alignment(0, -0.3), radius: 0.95, colors: [Colors.white, Color(0xFFF4ECDC)]),
                ),
                child: category.image.isNotEmpty
                    ? MallImage(url: category.image, size: 34, radius: 0, fit: BoxFit.cover)
                    : Center(
                        child: category.emoji.isNotEmpty
                            ? Text(category.emoji, style: const TextStyle(fontSize: 30))
                            : const Icon(Icons.spa_rounded, size: 28, color: Mall.deep),
                      ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
              child: Text(category.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Mall.titleBrown),),
            ),
          ],
        ),
      ),
    );
  }
}

/// Round category tile (rail + store chips).
class CategoryTile extends StatelessWidget {
  const CategoryTile({super.key, required this.category, required this.onTap, this.selected = false, this.size = 58});
  final StoreCategory category;
  final VoidCallback onTap;
  final bool selected;
  final double size;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: size + 8,
        child: Column(
          children: [
            Container(
              width: size,
              height: size,
              decoration: BoxDecoration(
                gradient: selected ? Mall.goldButton : null,
                color: selected ? null : Mall.card,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Mall.goldLine.withValues(alpha: 0.6), width: 1.5),
                boxShadow: [BoxShadow(color: const Color(0xFF966414).withValues(alpha: 0.3), blurRadius: 12, offset: const Offset(0, 6))],
              ),
              clipBehavior: Clip.antiAlias,
              child: category.image.isNotEmpty
                  ? MallImage(url: category.image, size: size * 0.5, radius: 15)
                  : Center(
                      child: category.emoji.isNotEmpty
                          ? Text(category.emoji, style: TextStyle(fontSize: size * 0.42))
                          : Icon(Icons.spa_rounded, size: size * 0.42, color: selected ? Colors.white : Mall.deep),
                    ),
            ),
            const SizedBox(height: 6),
            Text(category.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    color: selected ? Mall.goldInk : const Color(0xFF4A3814),),),
          ],
        ),
      ),
    );
  }
}
