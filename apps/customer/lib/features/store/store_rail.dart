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
      // Bazaar shelf — a warm parchment band framed as a temple-market shelf, the
      // category tiles sitting on a carved wooden ledge. Distinctive, not generic.
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFEAD9B2), Color(0xFFDCC392)],
        ),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.10), blurRadius: 14, offset: const Offset(0, 6))],
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 13, 12, 0),
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
                          color: Color(0xFF4A3814),
                          letterSpacing: 0.3,),),
                ),
                GestureDetector(
                  onTap: () => context.push('/store'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 6),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [Color(0xFF5A4218), Color(0xFF3A2A0E)]),
                      borderRadius: BorderRadius.circular(18),
                      boxShadow: [BoxShadow(color: const Color(0xFF3A2A0E).withValues(alpha: 0.4), blurRadius: 8, offset: const Offset(0, 4))],
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('Visit',
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFFF3DCA0)),),
                        SizedBox(width: 3),
                        Icon(Icons.arrow_forward_rounded, size: 13, color: Color(0xFFF3DCA0)),
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
          const SizedBox(height: 10),
          // The carved wooden ledge the "stalls" rest on — the shelf motif.
          Container(
            height: 8,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFFB9975A), Color(0xFF7C5E2A)],
              ),
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
