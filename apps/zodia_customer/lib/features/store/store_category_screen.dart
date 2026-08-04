import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'store_home_screen.dart' show MallAppBar;
import 'store_models.dart';
import 'store_providers.dart';
import 'store_theme.dart';
import 'store_widgets.dart';

/// A category page: any subcategories shown as tiles up top, then the products
/// that belong directly to this category.
class StoreCategoryScreen extends ConsumerWidget {
  const StoreCategoryScreen({super.key, required this.categoryId, this.categoryName});
  final String categoryId;
  final String? categoryName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final products = ref.watch(storeProductsByCategoryProvider(categoryId));
    final subs = ref.watch(storeSubcategoriesProvider(categoryId));

    return Scaffold(
      backgroundColor: const Color(0xFFF2F5FA),
      appBar: MallAppBar(title: categoryName ?? 'Category'),
      body: products.when(
        data: (list) {
          if (list.isEmpty && subs.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(30),
                child: Text('No products in this category yet.', style: TextStyle(color: Mall.warmGrey)),
              ),
            );
          }
          return CustomScrollView(
            slivers: [
              if (subs.isNotEmpty) ...[
                SliverToBoxAdapter(child: _header('Shop by type')),
                SliverToBoxAdapter(child: _subRow(context, subs)),
              ],
              if (list.isNotEmpty) ...[
                SliverToBoxAdapter(child: _header('${list.length} product${list.length == 1 ? '' : 's'}')),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                  sliver: SliverGrid(
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 0.58,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (_, i) => ProductCard(
                        product: list[i],
                        onTap: () => context.push('/store/product/${list[i].id}', extra: list[i]),
                        onAdd: () {
                          ref.read(cartProvider.notifier).add(list[i]);
                          ScaffoldMessenger.of(context)
                            ..hideCurrentSnackBar()
                            ..showSnackBar(const SnackBar(
                              content: Text('Added to cart'),
                              duration: Duration(milliseconds: 1200),
                              behavior: SnackBarBehavior.floating,
                            ),);
                        },
                      ),
                      childCount: list.length,
                    ),
                  ),
                ),
              ],
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator(color: Mall.deep)),
        error: (e, __) => Center(
          child: Text('Could not load products.\n$e', textAlign: TextAlign.center, style: const TextStyle(color: Mall.warmGrey)),
        ),
      ),
    );
  }

  Widget _header(String text) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
        child: Text(text, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Mall.warmGrey)),
      );

  Widget _subRow(BuildContext context, List<StoreCategory> subs) {
    return SizedBox(
      height: 96,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(12, 2, 12, 8),
        itemCount: subs.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) => CategoryTile(
          category: subs[i],
          size: 62,
          onTap: () => context.push('/store/category/${subs[i].id}', extra: subs[i].name),
        ),
      ),
    );
  }
}
