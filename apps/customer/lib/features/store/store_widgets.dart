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

/// The 2-column product card used across store screens.
class ProductCard extends StatelessWidget {
  const ProductCard({super.key, required this.product, required this.onTap, required this.onAdd});
  final StoreProduct product;
  final VoidCallback onTap;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Mall.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFF2ECDD)),
          boxShadow: [BoxShadow(color: const Color(0xFF503208).withValues(alpha: 0.10), blurRadius: 18, offset: const Offset(0, 8))],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Stack(
              children: [
                AspectRatio(aspectRatio: 1.15, child: MallImage(url: product.image, size: 52, radius: 0)),
                if (!product.inStock)
                  Positioned.fill(
                    child: Container(
                      color: Colors.white.withValues(alpha: 0.6),
                      alignment: Alignment.center,
                      child: const Text('Out of stock',
                          style: TextStyle(fontWeight: FontWeight.w700, color: Mall.ink),),
                    ),
                  ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(11, 10, 11, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    height: 34,
                    child: Text(product.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13, height: 1.25, fontWeight: FontWeight.w600, color: Mall.navy),),
                  ),
                  const SizedBox(height: 6),
                  PriceRow(product: product),
                  const SizedBox(height: 10),
                  GestureDetector(
                    onTap: product.inStock ? onAdd : null,
                    child: Container(
                      height: 36,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        gradient: product.inStock ? Mall.navyButton : null,
                        color: product.inStock ? null : Mall.mrp,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.add_shopping_cart_rounded, size: 15, color: Colors.white),
                          SizedBox(width: 6),
                          Text('Add to cart',
                              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: Colors.white),),
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
