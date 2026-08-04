import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'store_providers.dart';
import 'store_theme.dart';
import 'store_widgets.dart';

/// Product search across the whole catalog — matches the typed query against
/// each product's title, description and category. Filtering is client-side
/// over the already-loaded product list, so results update as you type with no
/// round-trips.
class StoreSearchScreen extends ConsumerStatefulWidget {
  const StoreSearchScreen({super.key});

  @override
  ConsumerState<StoreSearchScreen> createState() => _StoreSearchScreenState();
}

class _StoreSearchScreenState extends ConsumerState<StoreSearchScreen> {
  final _controller = TextEditingController();
  final _focus = FocusNode();
  String _q = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final products = ref.watch(storeAllProductsProvider);
    final needle = _q.trim().toLowerCase();

    return Scaffold(
      backgroundColor: const Color(0xFFF2F5FA),
      appBar: AppBar(
        backgroundColor: Mall.cream,
        elevation: 0,
        iconTheme: const IconThemeData(color: Mall.titleBrown),
        titleSpacing: 0,
        title: Container(
          height: 42,
          margin: const EdgeInsets.only(right: 12),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Mall.goldLine),
          ),
          child: Row(
            children: [
              const Icon(Icons.search_rounded, size: 19, color: Mall.goldInk),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _controller,
                  focusNode: _focus,
                  textInputAction: TextInputAction.search,
                  onChanged: (v) => setState(() => _q = v),
                  style: const TextStyle(fontSize: 15, color: Mall.ink),
                  decoration: const InputDecoration(
                    isCollapsed: true,
                    border: InputBorder.none,
                    hintText: 'Search rudraksha, gemstones, yantras…',
                    hintStyle: TextStyle(color: Mall.warmGrey, fontSize: 14),
                  ),
                ),
              ),
              if (_q.isNotEmpty)
                GestureDetector(
                  onTap: () => setState(() {
                    _controller.clear();
                    _q = '';
                  }),
                  child: const Icon(Icons.close_rounded, size: 18, color: Mall.warmGrey),
                ),
            ],
          ),
        ),
      ),
      body: products.when(
        data: (all) {
          if (needle.isEmpty) {
            return const _Hint();
          }
          final results = all.where((p) {
            final hay = '${p.title} ${p.description} ${p.categoryName}'.toLowerCase();
            return hay.contains(needle);
          }).toList();
          if (results.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(30),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.search_off_rounded, size: 44, color: Mall.warmGrey),
                    const SizedBox(height: 12),
                    Text('No products match “$_q”.',
                        textAlign: TextAlign.center, style: const TextStyle(color: Mall.warmGrey)),
                  ],
                ),
              ),
            );
          }
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text('${results.length} result${results.length == 1 ? '' : 's'}',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Mall.warmGrey)),
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
                  itemCount: results.length,
                  itemBuilder: (_, i) {
                    final p = results[i];
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
                          ));
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
              textAlign: TextAlign.center, style: const TextStyle(color: Mall.warmGrey)),
        ),
      ),
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(30),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.storefront_outlined, size: 46, color: Mall.goldLine),
            SizedBox(height: 12),
            Text('Search Zodia Mall',
                style: TextStyle(fontFamily: 'serif', fontSize: 18, fontWeight: FontWeight.w700, color: Mall.titleBrown)),
            SizedBox(height: 6),
            Text('Type a product, category or keyword to find it.',
                textAlign: TextAlign.center, style: TextStyle(color: Mall.warmGrey, fontSize: 13.5)),
          ],
        ),
      ),
    );
  }
}
