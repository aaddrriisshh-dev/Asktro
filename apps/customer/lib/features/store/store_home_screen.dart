import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'store_models.dart';
import 'store_providers.dart';
import 'store_theme.dart';
import 'store_widgets.dart';

/// The Asktro Mall landing screen — banner, category chips, and a featured
/// product grid. Reached from the home rail's "Visit Store" and the bottom nav.
class StoreHomeScreen extends ConsumerWidget {
  const StoreHomeScreen({super.key, this.embedded = false});

  /// When shown inside the bottom-nav tab there is no back arrow.
  final bool embedded;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cats = ref.watch(storeCategoriesProvider);
    final featured = ref.watch(storeFeaturedProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF8F5FF),
      appBar: MallAppBar(title: 'Asktro Mall', automaticallyImplyLeading: !embedded),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          const _Banner(),
          // Category chips
          cats.when(
            data: (list) => list.isEmpty
                ? const SizedBox.shrink()
                : SizedBox(
                    height: 92,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 11),
                      itemBuilder: (_, i) => CategoryTile(
                        category: list[i],
                        size: 60,
                        onTap: () => context.push('/store/category/${list[i].id}', extra: list[i].name),
                      ),
                    ),
                  ),
            loading: () => const SizedBox(height: 92),
            error: (_, __) => const SizedBox.shrink(),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 10),
            child: Row(
              children: [
                const Text('Popular picks',
                    style: TextStyle(fontFamily: 'serif', fontSize: 19, fontWeight: FontWeight.w700, color: Mall.titleBrown),),
                const Spacer(),
                Icon(Icons.auto_awesome, size: 15, color: Mall.deep.withValues(alpha: 0.7)),
              ],
            ),
          ),
          featured.when(
            data: (list) => list.isEmpty
                ? const _Empty()
                : GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 0.60,
                    ),
                    itemCount: list.length,
                    itemBuilder: (_, i) => _cardFor(context, ref, list[i]),
                  ),
            loading: () => const Padding(
              padding: EdgeInsets.only(top: 40),
              child: Center(child: CircularProgressIndicator(color: Mall.deep)),
            ),
            error: (_, __) => const _Empty(),
          ),
        ],
      ),
    );
  }

  Widget _cardFor(BuildContext context, WidgetRef ref, StoreProduct p) => ProductCard(
        product: p,
        onTap: () => context.push('/store/product/${p.id}', extra: p),
        onAdd: () {
          ref.read(cartProvider.notifier).add(p);
          _snackAdded(context);
        },
      );
}

void _snackAdded(BuildContext context) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(const SnackBar(
      content: Text('Added to cart'),
      duration: Duration(milliseconds: 1200),
      behavior: SnackBarBehavior.floating,
    ),);
}

class _Banner extends StatelessWidget {
  const _Banner();
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.fromLTRB(18, 20, 18, 20),
      decoration: BoxDecoration(
        gradient: Mall.bannerGradient,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: const Color(0xFF5A3C0A).withValues(alpha: 0.5), blurRadius: 26, offset: const Offset(0, 12))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Blessed by Asktro',
              style: TextStyle(fontFamily: 'serif', fontSize: 25, fontWeight: FontWeight.w700, color: Color(0xFFF6D98A)),),
          const SizedBox(height: 5),
          Text('Certified gemstones, rudraksha, yantras & more — energised before dispatch, delivered to your door.',
              style: TextStyle(fontSize: 12.5, height: 1.5, color: const Color(0xFFF3E7CF).withValues(alpha: 0.95)),),
        ],
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();
  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.fromLTRB(24, 50, 24, 40),
      child: Column(
        children: [
          Icon(Icons.storefront_outlined, size: 46, color: Mall.deep),
          SizedBox(height: 12),
          Text('The store is being stocked', style: TextStyle(fontWeight: FontWeight.w700, color: Mall.navy)),
          SizedBox(height: 4),
          Text('Check back soon for blessed products.', style: TextStyle(color: Mall.warmGrey, fontSize: 13)),
        ],
      ),
    );
  }
}

/// Shared gold-accented store app bar with a cart button + badge.
class MallAppBar extends ConsumerWidget implements PreferredSizeWidget {
  const MallAppBar({super.key, required this.title, this.automaticallyImplyLeading = true, this.showCart = true});
  final String title;
  final bool automaticallyImplyLeading;
  final bool showCart;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(cartCountProvider);
    return AppBar(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.white,
      elevation: 0.5,
      automaticallyImplyLeading: automaticallyImplyLeading,
      iconTheme: const IconThemeData(color: Mall.navy),
      title: Text(title,
          style: const TextStyle(fontFamily: 'serif', fontSize: 20, fontWeight: FontWeight.w700, color: Mall.ink),),
      actions: [
        if (showCart)
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                IconButton(
                  icon: const Icon(Icons.shopping_cart_outlined, color: Mall.goldInk),
                  onPressed: () => context.push('/store/cart'),
                ),
                if (count > 0)
                  Positioned(
                    right: 4,
                    top: 4,
                    child: Container(
                      padding: const EdgeInsets.all(3),
                      decoration: const BoxDecoration(color: Mall.deep, shape: BoxShape.circle),
                      constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                      child: Text('$count',
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold),),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}
