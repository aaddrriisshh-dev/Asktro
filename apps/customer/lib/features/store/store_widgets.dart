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
    final rib = ribbon ??
        (product.hasDiscount ? (text: '${product.discountPercent}% OFF', color: Mall.offInk) : null);
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
                  if (rib != null)
                    Positioned(
                      left: 0, top: 9,
                      child: Container(
                        padding: const EdgeInsets.fromLTRB(7, 3, 8, 3),
                        decoration: BoxDecoration(color: rib.color, borderRadius: const BorderRadius.horizontal(right: Radius.circular(8))),
                        child: Text(rib.text, style: const TextStyle(fontSize: 8.5, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: 0.2)),
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
              padding: const EdgeInsets.fromLTRB(11, 9, 10, 11),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(product.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Mall.navy),),
                  const SizedBox(height: 7),
                  Row(
                    children: [
                      Expanded(
                        child: Wrap(
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
                      ),
                      GestureDetector(
                        onTap: product.inStock ? onAdd : null,
                        child: Container(
                          width: 30, height: 30,
                          decoration: BoxDecoration(
                            gradient: product.inStock ? Mall.goldButton : null,
                            color: product.inStock ? null : Mall.mrp,
                            borderRadius: BorderRadius.circular(10),
                            boxShadow: product.inStock
                                ? [BoxShadow(color: const Color(0xFF966414).withValues(alpha: 0.5), blurRadius: 8, offset: const Offset(0, 4))]
                                : null,
                          ),
                          child: const Icon(Icons.add_rounded, size: 19, color: Colors.white),
                        ),
                      ),
                    ],
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
class ClaimMarquee extends StatefulWidget {
  const ClaimMarquee({super.key, required this.phrases});
  final List<String> phrases;

  @override
  State<ClaimMarquee> createState() => _ClaimMarqueeState();
}

class _ClaimMarqueeState extends State<ClaimMarquee> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(seconds: 18))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final row = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final p in widget.phrases) ...[
          const Padding(padding: EdgeInsets.symmetric(horizontal: 10), child: Icon(Icons.auto_awesome, size: 11, color: Mall.gold)),
          Text(p, style: const TextStyle(color: Color(0xFFF3E7CF), fontSize: 11, fontWeight: FontWeight.w600)),
        ],
      ],
    );
    return Container(
      height: 34,
      decoration: const BoxDecoration(
        gradient: LinearGradient(colors: [Color(0xFF241A0E), Color(0xFF3A2C16), Color(0xFF241A0E)]),
      ),
      clipBehavior: Clip.hardEdge,
      child: LayoutBuilder(builder: (context, box) {
        return AnimatedBuilder(
          animation: _c,
          builder: (context, _) {
            return OverflowBox(
              alignment: Alignment.centerLeft,
              minWidth: 0, maxWidth: double.infinity,
              child: Transform.translate(
                offset: Offset(-_c.value * box.maxWidth, 0),
                child: Row(children: [
                  SizedBox(width: box.maxWidth, child: Center(child: row)),
                  SizedBox(width: box.maxWidth, child: Center(child: row)),
                ],),
              ),
            );
          },
        );
      },),
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
