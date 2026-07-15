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
  int _qty = 1;
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

  void _addToCart({bool goCart = false}) {
    final p = _p;
    if (p == null) return;
    ref.read(cartProvider.notifier).add(p, qty: _qty);
    if (goCart) {
      context.push('/store/cart');
    } else {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text('$_qty × ${p.title} added'),
          duration: const Duration(milliseconds: 1400),
          behavior: SnackBarBehavior.floating,
          action: SnackBarAction(label: 'View cart', onPressed: () => context.push('/store/cart')),
        ),);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _p;
    return Scaffold(
      backgroundColor: const Color(0xFFF8F5FF),
      appBar: const MallAppBar(title: 'Product Detail'),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Mall.deep))
          : p == null
              ? const Center(child: Text('This product is no longer available.', style: TextStyle(color: Mall.warmGrey)))
              : _body(p),
      bottomNavigationBar: p == null ? null : _stickyBar(p),
    );
  }

  Widget _body(StoreProduct p) {
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
                itemBuilder: (_, i) => MallImage(url: imgs[i], size: 120, radius: 0, fit: BoxFit.contain),
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
              const Row(
                children: [
                  Icon(Icons.star_rounded, size: 17, color: Color(0xFFE0A92E)),
                  SizedBox(width: 4),
                  Text('4.8', style: TextStyle(fontWeight: FontWeight.w700, color: Mall.ink, fontSize: 13)),
                  Text('  ·  Trusted, energised & certified', style: TextStyle(color: Mall.warmGrey, fontSize: 12.5)),
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
                    const Text('Select quantity', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: Color(0xFF5A4A2A))),
                    const Spacer(),
                    _stepper(),
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
              const Row(
                children: [
                  _TrustBadge(icon: Icons.verified_rounded, label: 'Certified'),
                  SizedBox(width: 8),
                  _TrustBadge(icon: Icons.local_shipping_outlined, label: 'Free over ₹499'),
                  SizedBox(width: 8),
                  _TrustBadge(icon: Icons.autorenew_rounded, label: 'Easy Returns'),
                ],
              ),
              const SizedBox(height: 90),
            ],
          ),
        ),
      ],
    );
  }

  Widget _stepper() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(11),
        border: Border.all(color: Mall.hair, width: 1.4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _stepBtn(Icons.remove, () { if (_qty > 1) setState(() => _qty--); }),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text('$_qty', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Mall.navy)),
          ),
          _stepBtn(Icons.add, () { if (_qty < 10) setState(() => _qty++); }),
        ],
      ),
    );
  }

  Widget _stepBtn(IconData icon, VoidCallback onTap) => InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
          decoration: const BoxDecoration(color: Color(0xFFFFFAF0)),
          child: Icon(icon, size: 18, color: Mall.goldInk),
        ),
      );

  Widget _stickyBar(StoreProduct p) {
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
              onTap: p.inStock ? () => _addToCart(goCart: true) : null,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 13),
                decoration: BoxDecoration(
                  gradient: p.inStock ? Mall.goldButton : null,
                  color: p.inStock ? null : Mall.mrp,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Text(p.inStock ? 'Add to Cart' : 'Out of stock',
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white),),
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
