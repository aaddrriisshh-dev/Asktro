import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'store_home_screen.dart' show MallAppBar;
import 'store_providers.dart';
import 'store_theme.dart';
import 'store_widgets.dart';

/// All products within one category.
class StoreCategoryScreen extends ConsumerWidget {
  const StoreCategoryScreen({super.key, required this.categoryId, this.categoryName});
  final String categoryId;
  final String? categoryName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final products = ref.watch(storeProductsByCategoryProvider(categoryId));

    return Scaffold(
      backgroundColor: const Color(0xFFF8F5FF),
      appBar: MallAppBar(title: categoryName ?? 'Category'),
      body: products.when(
        data: (list) {
          if (list.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(30),
                child: Text('No products in this category yet.', style: TextStyle(color: Mall.warmGrey)),
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
                    childAspectRatio: 0.60,
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
        error: (e, __) => Center(child: Text('Could not load products.\n$e', textAlign: TextAlign.center, style: const TextStyle(color: Mall.warmGrey))),
      ),
    );
  }
}
