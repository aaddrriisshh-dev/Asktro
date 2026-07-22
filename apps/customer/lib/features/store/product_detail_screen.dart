import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'store_home_screen.dart' show MallAppBar;
import 'store_models.dart';
import 'store_providers.dart';
import 'store_theme.dart';
import 'store_widgets.dart';

/// Product detail — image carousel, price, quantity stepper, description, trust
/// badges, and a sticky Add-to-Cart bar. Accepts a preloaded [product] (from a
/// card tap) or fetches by [productId] on a deep link.
class ProductDetailScreen extends ConsumerStatefulWidget {
  const ProductDetailScreen({super.key, required this.productId, this.product});
  final String productId;
  final StoreProduct? product;

  @override
  ConsumerState<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  int _imgIndex = 0;
  final _pageCtrl = PageController();
  StoreProduct? _p;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _p = widget.product;
    if (_p == null) _fetch();
  }

  Future<void> _fetch() async {
    setState(() => _loading = true);
    final p = await ref.read(storeRepositoryProvider).fetchProduct(widget.productId);
    if (!mounted) return;
    setState(() {
      _p = p;
      _loading = false;
    });
  }

  @override
  void dispose() {
    _pageCtrl.dispose();
    super.dispose();
  }

  /// How many of THIS product are currently in the cart.
  int _qtyInCart(StoreProduct p) =>
      ref.watch(cartProvider).where((c) => c.product.id == p.id).fold<int>(0, (n, c) => n + c.qty);

  void _setQty(StoreProduct p, int qty) {
    final n = ref.read(cartProvider.notifier);
    if (qty <= 0) {
      n.remove(p.id);
    } else if (_qtyInCart(p) == 0) {
      n.add(p); // first unit — insert the line
    } else {
      n.setQty(p.id, qty);
    }
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(msg),
        duration: const Duration(milliseconds: 1400),
        behavior: SnackBarBehavior.floating,
        action: SnackBarAction(label: 'View cart', onPressed: () => context.push('/store/cart')),
      ),);
  }

  @override
  Widget build(BuildContext context) {
    final p = _p;
    final qty = p == null ? 0 : _qtyInCart(p);
    return Scaffold(
      backgroundColor: const Color(0xFFF8F5FF),
      appBar: const MallAppBar(title: 'Product Detail'),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Mall.deep))
          : p == null
              ? const Center(child: Text('This product is no longer available.', style: TextStyle(color: Mall.warmGrey)))
              : _body(p, qty),
      bottomNavigationBar: p == null ? null : _stickyBar(p, qty),
    );
  }

  Widget _body(StoreProduct p, int qty) {
    final imgs = p.images.isEmpty ? <String?>[null] : p.images;
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        // Carousel
        Container(
          color: const Color(0xFFF3E7CC),
          height: 300,
          child: Stack(
            children: [
              PageView.builder(
                controller: _pageCtrl,
                onPageChanged: (i) => setState(() => _imgIndex = i),
                itemCount: imgs.length,
                itemBuilder: (_, i) => MallImage(url: imgs[i], size: 120, radius: 0, fit: BoxFit.contain, decodeWidth: 1080),
              ),
              if (imgs.length > 1)
                Positioned(
                  bottom: 12,
                  left: 0,
                  right: 0,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(imgs.length, (i) {
                      final on = i == _imgIndex;
                      return AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        width: on ? 16 : 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: on ? Mall.deep : Mall.deep.withValues(alpha: 0.3),
                          borderRadius: BorderRadius.circular(3),
                        ),
                      );
                    }),
                  ),
                ),
            ],
          ),
        ),
        // Thumbnails
        if (p.images.length > 1)
          SizedBox(
            height: 62,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 4),
              itemCount: p.images.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) => GestureDetector(
                onTap: () => _pageCtrl.animateToPage(i, duration: const Duration(milliseconds: 250), curve: Curves.easeOut),
                child: Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(11),
                    border: Border.all(color: i == _imgIndex ? const Color(0xFFE6A3A0) : Colors.transparent, width: 2),
                  ),
                  child: MallImage(url: p.images[i], size: 22, radius: 9),
                ),
              ),
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(p.title, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: Mall.navy)),
              const SizedBox(height: 6),
              Row(
                children: [
                  const Icon(Icons.star_rounded, size: 17, color: Color(0xFFE0A92E)),
                  const SizedBox(width: 4),
                  Text(p.rating.toStringAsFixed(1),
                      style: const TextStyle(fontWeight: FontWeight.w700, color: Mall.ink, fontSize: 13),),
                  if (p.ratingCount > 0)
                    Text('  (${p.ratingCount})', style: const TextStyle(color: Mall.warmGrey, fontSize: 12.5)),
                  const Text('  ·  Trusted, energised & certified', style: TextStyle(color: Mall.warmGrey, fontSize: 12.5)),
                ],
              ),
              const SizedBox(height: 12),
              PriceRow(product: p, big: true),
              const SizedBox(height: 16),
              // Quantity
              Container(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Color(0xFFFDEEE6), Color(0xFFFAF1DD)]),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Row(
                  children: [
                    Text(qty > 0 ? 'In your cart' : 'Add to cart',
                        style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: Color(0xFF5A4A2A)),),
                    const Spacer(),
                    _stepper(p, qty),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              if (p.description.isNotEmpty) ...[
                const Text('Product Description', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: Mall.navy)),
                const SizedBox(height: 8),
                Text(p.description, style: const TextStyle(fontSize: 13, height: 1.6, color: Color(0xFF6A5F4A))),
                const SizedBox(height: 18),
              ],
              if (p.bundleItems.isNotEmpty) ...[
                _bundle(p),
                const SizedBox(height: 18),
              ],
              if (p.specs.isNotEmpty) ...[
                _specsTable(p),
                const SizedBox(height: 18),
              ],
              const Row(
                children: [
                  _TrustBadge(icon: Icons.verified_rounded, label: 'Certified'),
                  SizedBox(width: 8),
                  _TrustBadge(icon: Icons.local_shipping_outlined, label: 'Free over ₹499'),
                  SizedBox(width: 8),
                  _TrustBadge(icon: Icons.autorenew_rounded, label: 'Easy Returns'),
                ],
              ),
              const SizedBox(height: 22),
              _reviews(p),
              const SizedBox(height: 90),
            ],
          ),
        ),
      ],
    );
  }

  Widget _bundle(StoreProduct p) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text('🎁 ', style: TextStyle(fontSize: 15)),
            Text('This combo includes ${p.bundleItems.length} items',
                style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: Mall.navy),),
          ],
        ),
        const SizedBox(height: 10),
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFFFFFAF0),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Mall.goldLine),
          ),
          child: Column(
            children: [
              for (var i = 0; i < p.bundleItems.length; i++)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
                  decoration: BoxDecoration(
                    border: i == 0 ? null : const Border(top: BorderSide(color: Color(0xFFF0E6CC))),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 44, height: 44,
                        decoration: BoxDecoration(borderRadius: BorderRadius.circular(10)),
                        clipBehavior: Clip.antiAlias,
                        child: MallImage(url: p.bundleItems[i].image, size: 22, radius: 10),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(p.bundleItems[i].title,
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Mall.ink),),
                      ),
                      if (p.bundleItems[i].qty > 1)
                        Text('×${p.bundleItems[i].qty}',
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Mall.goldInk),),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _specsTable(StoreProduct p) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Specifications', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: Mall.navy)),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFFFFFAF0),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Mall.goldLine),
          ),
          child: Column(
            children: [
              for (var i = 0; i < p.specs.length; i++)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
                  decoration: BoxDecoration(
                    border: i == 0 ? null : const Border(top: BorderSide(color: Color(0xFFF0E6CC))),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        width: 116,
                        child: Text(p.specs[i].label,
                            style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Color(0xFF7A6534)),),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(p.specs[i].value,
                            style: const TextStyle(fontSize: 12.5, color: Color(0xFF4A3F2A)),),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _reviews(StoreProduct p) {
    final reviews = ref.watch(storeReviewsProvider(p.id)).valueOrNull ?? const [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Ratings & Reviews', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: Mall.navy)),
        const SizedBox(height: 10),
        Row(
          children: [
            Text(p.rating.toStringAsFixed(1),
                style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: Mall.ink, height: 1),),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                StarRow(rating: p.rating, size: 16),
                const SizedBox(height: 3),
                Text(p.ratingCount > 0 ? '${p.ratingCount} ratings' : 'Be the first to review',
                    style: const TextStyle(fontSize: 12, color: Mall.warmGrey),),
              ],
            ),
          ],
        ),
        if (reviews.isNotEmpty) const SizedBox(height: 14),
        for (final r in reviews) _reviewTile(r),
      ],
    );
  }

  Widget _reviewTile(StoreReview r) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(13, 11, 13, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Mall.hair),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              StarRow(rating: r.rating, size: 13),
              const SizedBox(width: 8),
              Flexible(
                child: Text(r.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: Mall.ink),),
              ),
              if (r.verified) ...[
                const SizedBox(width: 6),
                const Icon(Icons.verified_rounded, size: 13, color: Mall.green),
              ],
              const Spacer(),
              if (r.createdAtMs != null)
                Text(_shortDate(r.createdAtMs!), style: const TextStyle(fontSize: 10.5, color: Mall.warmGrey)),
            ],
          ),
          if (r.title.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(r.title, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: Mall.navy)),
          ],
          if (r.body.isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(r.body, style: const TextStyle(fontSize: 12.5, height: 1.45, color: Color(0xFF5A4B2E))),
          ],
        ],
      ),
    );
  }

  static String _shortDate(int ms) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final d = DateTime.fromMillisecondsSinceEpoch(ms);
    return '${months[d.month - 1]} ${d.year}';
  }

  Widget _stepper(StoreProduct p, int qty) {
    final canAdd = qty < 10 && p.inStock;
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(11),
        border: Border.all(color: Mall.hair, width: 1.4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _stepBtn(Icons.remove, qty > 0 ? () => _setQty(p, qty - 1) : null),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text('$qty', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Mall.navy)),
          ),
          _stepBtn(Icons.add, canAdd ? () => _setQty(p, qty + 1) : null),
        ],
      ),
    );
  }

  Widget _stepBtn(IconData icon, VoidCallback? onTap) => InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
          decoration: const BoxDecoration(color: Color(0xFFFFFAF0)),
          child: Icon(icon, size: 18, color: onTap == null ? Mall.mrp : Mall.goldInk),
        ),
      );

  Widget _stickyBar(StoreProduct p, int qty) {
    final inCart = qty > 0;
    final enabled = p.inStock;
    return SafeArea(
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
        decoration: BoxDecoration(
          color: Colors.white,
          border: const Border(top: BorderSide(color: Color(0xFFF0EEF7))),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 20, offset: const Offset(0, -8))],
        ),
        child: Row(
          children: [
            Expanded(child: PriceRow(product: p)),
            GestureDetector(
              onTap: !enabled
                  ? null
                  : inCart
                      ? () => context.push('/store/cart')
                      : () {
                          _setQty(p, 1);
                          _snack('${p.title} added');
                        },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 13),
                decoration: BoxDecoration(
                  gradient: enabled ? Mall.goldButton : null,
                  color: enabled ? null : Mall.mrp,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(inCart ? Icons.shopping_cart_rounded : Icons.add_shopping_cart_rounded, size: 17, color: Colors.white),
                    const SizedBox(width: 7),
                    Text(!enabled ? 'Out of stock' : (inCart ? 'Go to Cart ($qty)' : 'Add to Cart'),
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white),),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TrustBadge extends StatelessWidget {
  const _TrustBadge({required this.icon, required this.label});
  final IconData icon;
  final String label;
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 6),
        decoration: BoxDecoration(
          color: const Color(0xFFFFFAF0),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Mall.goldLine),
        ),
        child: Column(
          children: [
            Icon(icon, size: 17, color: Mall.goldInk),
            const SizedBox(height: 3),
            Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFF7A6534))),
          ],
        ),
      ),
    );
  }
}
