import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'store_home_screen.dart' show MallAppBar;
import 'store_providers.dart';
import 'store_theme.dart';
import 'store_widgets.dart';

/// The full catalog — every active product in a grid, optionally filtered to a
/// merch rail (best sellers / new launches / combos). The storefront only shows
/// a small preview + "View all" of each, so the home page always ends; this
/// screen is where the whole (potentially huge) list lives and scrolls.
class AllProductsScreen extends ConsumerWidget {
  const AllProductsScreen({super.key, this.filter = 'all', this.title = 'All Products'});

  /// One of: 'all', 'best', 'new', 'combo'.
  final String filter;
  final String title;

  /// Maps a route filter key to its screen title.
  static String titleFor(String filter) => switch (filter) {
        'best' => 'Best Sellers',
        'new' => 'New Launches',
        'combo' => 'Combo Deals',
        _ => 'All Products',
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final products = ref.watch(storeAllProductsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF8F5FF),
      appBar: MallAppBar(title: title),
      body: products.when(
        data: (all) {
          final list = switch (filter) {
            'best' => all.where((p) => p.bestSeller).toList(),
            'new' => all.where((p) => p.newLaunch).toList(),
            'combo' => all.where((p) => p.combo).toList(),
            _ => all,
          };
          if (list.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(30),
                child: Text('No products yet.', style: TextStyle(color: Mall.warmGrey)),
              ),
            );
          }
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: Row(
                  children: [
                    Text('${list.length} product${list.length == 1 ? '' : 's'}',
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Mall.warmGrey),),
                  ],
                ),
              ),
              Expanded(
                child: GridView.builder(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    childAspectRatio: 0.58,
                  ),
                  itemCount: list.length,
                  itemBuilder: (_, i) {
                    final p = list[i];
                    return ProductCard(
                      product: p,
                      onTap: () => context.push('/store/product/${p.id}', extra: p),
                      onAdd: () {
                        ref.read(cartProvider.notifier).add(p);
                        ScaffoldMessenger.of(context)
                          ..hideCurrentSnackBar()
                          ..showSnackBar(const SnackBar(
                            content: Text('Added to cart'),
                            duration: Duration(milliseconds: 1200),
                            behavior: SnackBarBehavior.floating,
                          ),);
                      },
                    );
                  },
                ),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator(color: Mall.deep)),
        error: (e, __) => Center(
          child: Text('Could not load products.\n$e',
              textAlign: TextAlign.center, style: const TextStyle(color: Mall.warmGrey),),
        ),
      ),
    );
  }
}
