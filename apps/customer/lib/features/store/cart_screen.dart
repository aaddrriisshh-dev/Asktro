import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'store_home_screen.dart' show MallAppBar;
import 'store_models.dart';
import 'store_providers.dart';
import 'store_theme.dart';
import 'store_widgets.dart';

/// The cart — line items with quantity steppers, an order summary, and a
/// Checkout button. Shipping is estimated here and confirmed by the server.
class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  static const _shipFeePaise = 4900;
  static const _freeOverPaise = 49900;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(cartProvider);
    final subtotal = items.fold<int>(0, (n, c) => n + c.lineTotalPaise);
    final shipping = items.isEmpty || subtotal >= _freeOverPaise ? 0 : _shipFeePaise;
    final total = subtotal + shipping;

    return Scaffold(
      backgroundColor: const Color(0xFFF8F5FF),
      appBar: const MallAppBar(title: 'Your Cart', showCart: false),
      body: items.isEmpty
          ? const _EmptyCart()
          : Column(
              children: [
                Expanded(
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, i) => _CartRow(item: items[i]),
                  ),
                ),
                _summary(context, ref, subtotal, shipping, total),
              ],
            ),
    );
  }

  Widget _summary(BuildContext context, WidgetRef ref, int subtotal, int shipping, int total) {
    return SafeArea(
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.07), blurRadius: 22, offset: const Offset(0, -8))],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _row('Subtotal', Mall.rupees(subtotal)),
            const SizedBox(height: 6),
            _row('Shipping', shipping == 0 ? 'FREE' : Mall.rupees(shipping), green: shipping == 0),
            const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Divider(height: 1)),
            _row('Total', Mall.rupees(total), bold: true),
            const SizedBox(height: 14),
            GestureDetector(
              onTap: () => context.push('/store/checkout'),
              child: Container(
                height: 52,
                alignment: Alignment.center,
                decoration: BoxDecoration(gradient: Mall.goldButton, borderRadius: BorderRadius.circular(15)),
                child: const Text('Proceed to Checkout',
                    style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: Colors.white),),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(String k, String v, {bool bold = false, bool green = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(k, style: TextStyle(fontSize: bold ? 16 : 14, fontWeight: bold ? FontWeight.w700 : FontWeight.w500, color: bold ? Mall.navy : Mall.warmGrey)),
        Text(v, style: TextStyle(fontSize: bold ? 18 : 14, fontWeight: bold ? FontWeight.w800 : FontWeight.w600, color: green ? Mall.green : (bold ? Mall.navy : Mall.ink))),
      ],
    );
  }
}

class _CartRow extends ConsumerWidget {
  const _CartRow({required this.item});
  final CartItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = item.product;
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFF0EAdb)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 62, height: 62, child: MallImage(url: p.image, size: 26, radius: 12)),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(p.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: Mall.navy)),
                const SizedBox(height: 4),
                Text(Mall.rupees(p.pricePaise), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Mall.green)),
                const SizedBox(height: 8),
                _qtyStepper(ref),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              InkWell(
                onTap: () => ref.read(cartProvider.notifier).remove(p.id),
                child: const Icon(Icons.close_rounded, size: 18, color: Mall.warmGrey),
              ),
              const SizedBox(height: 22),
              Text(Mall.rupees(item.lineTotalPaise), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Mall.ink)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _qtyStepper(WidgetRef ref) {
    final ctrl = ref.read(cartProvider.notifier);
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFFFFAF0),
        borderRadius: BorderRadius.circular(9),
        border: Border.all(color: Mall.hair),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _b(Icons.remove, () => ctrl.setQty(item.product.id, item.qty - 1)),
          Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: Text('${item.qty}', style: const TextStyle(fontWeight: FontWeight.w700, color: Mall.navy))),
          _b(Icons.add, () { if (item.qty < 10) ctrl.setQty(item.product.id, item.qty + 1); }),
        ],
      ),
    );
  }

  Widget _b(IconData icon, VoidCallback onTap) => InkWell(
        onTap: onTap,
        child: Padding(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6), child: Icon(icon, size: 15, color: Mall.goldInk)),
      );
}

class _EmptyCart extends StatelessWidget {
  const _EmptyCart();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.shopping_cart_outlined, size: 52, color: Mall.deep),
          const SizedBox(height: 14),
          const Text('Your cart is empty', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: Mall.navy)),
          const SizedBox(height: 6),
          const Text('Add some blessed products to get started.', style: TextStyle(color: Mall.warmGrey, fontSize: 13)),
          const SizedBox(height: 18),
          GestureDetector(
            onTap: () => context.go('/store'),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              decoration: BoxDecoration(gradient: Mall.goldButton, borderRadius: BorderRadius.circular(14)),
              child: const Text('Browse the store', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }
}
