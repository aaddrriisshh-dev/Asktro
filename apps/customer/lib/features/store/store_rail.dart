import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'store_providers.dart';
import 'store_theme.dart';
import 'store_widgets.dart';

/// The "Asktro Mall" ghee-gold rail on the home screen: a compact warm band with
/// the store title, a Visit Store pill, and a horizontal row of category tiles.
/// Hidden entirely when the catalog has no active categories.
class StoreRail extends ConsumerWidget {
  const StoreRail({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cats = ref.watch(storeRootCategoriesProvider);
    if (cats.isEmpty) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      // Full-bleed band that reaches both screen edges (interim original look —
      // a new direction is being chosen from previews).
      margin: const EdgeInsets.symmetric(vertical: 6),
      padding: const EdgeInsets.only(top: 14, bottom: 14),
      decoration: const BoxDecoration(gradient: Mall.gheeGradient),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                const Text('🪔', style: TextStyle(fontSize: 18)),
                const SizedBox(width: 7),
                const Expanded(
                  child: Text('Asktro Mall',
                      style: TextStyle(
                          fontFamily: 'serif',
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          color: Mall.titleBrown,
                          letterSpacing: 0.3,),),
                ),
                GestureDetector(
                  onTap: () => context.push('/store'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      gradient: Mall.goldButton,
                      borderRadius: BorderRadius.circular(18),
                      boxShadow: [BoxShadow(color: const Color(0xFF966414).withValues(alpha: 0.5), blurRadius: 10, offset: const Offset(0, 5))],
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('Visit Store',
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.white),),
                        SizedBox(width: 3),
                        Icon(Icons.arrow_forward_rounded, size: 13, color: Colors.white),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 82,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: cats.length + 1,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (context, i) {
                if (i == cats.length) return _viewAllTile(context);
                final c = cats[i];
                return CategoryTile(
                  category: c,
                  onTap: () => context.push('/store/category/${c.id}', extra: c.name),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _viewAllTile(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/store'),
      child: SizedBox(
        width: 66,
        child: Column(
          children: [
            Container(
              width: 58,
              height: 58,
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFFFFF7E6), Color(0xFFF2DCA0)]),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Mall.goldLine.withValues(alpha: 0.6), width: 1.5),
              ),
              child: const Center(
                child: Text('All →', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Mall.goldInk)),
              ),
            ),
            const SizedBox(height: 6),
            const Text('View all',
                style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: Color(0xFF4A3814)),),
          ],
        ),
      ),
    );
  }
}
