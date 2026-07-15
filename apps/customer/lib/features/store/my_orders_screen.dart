import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'store_home_screen.dart' show MallAppBar;
import 'store_models.dart';
import 'store_providers.dart';
import 'store_theme.dart';
import 'store_widgets.dart';

const _statusLabel = {
  'pending_payment': 'Pending payment',
  'confirmed': 'Confirmed',
  'shipped': 'Shipped',
  'delivered': 'Delivered',
  'cancelled': 'Cancelled',
};

/// The customer's store orders (reached from Profile → My Orders).
class MyOrdersScreen extends ConsumerWidget {
  const MyOrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(myOrdersProvider);
    return Scaffold(
      backgroundColor: const Color(0xFFF8F5FF),
      appBar: const MallAppBar(title: 'My Orders', showCart: false),
      body: orders.when(
        data: (list) {
          // Hide never-paid abandoned drafts.
          final shown = list.where((o) => o.status != 'pending_payment').toList();
          if (shown.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.receipt_long_outlined, size: 50, color: Mall.deep),
                  const SizedBox(height: 12),
                  const Text('No orders yet', style: TextStyle(fontWeight: FontWeight.w700, color: Mall.navy, fontSize: 16)),
                  const SizedBox(height: 6),
                  const Text('Your Asktro Mall orders will appear here.', style: TextStyle(color: Mall.warmGrey, fontSize: 13)),
                  const SizedBox(height: 16),
                  GestureDetector(
                    onTap: () => context.push('/store'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 11),
                      decoration: BoxDecoration(gradient: Mall.goldButton, borderRadius: BorderRadius.circular(14)),
                      child: const Text('Visit Asktro Mall', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                    ),
                  ),
                ],
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 20),
            itemCount: shown.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, i) => _OrderCard(order: shown[i]),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator(color: Mall.deep)),
        error: (_, __) => const Center(child: Text('Could not load your orders.', style: TextStyle(color: Mall.warmGrey))),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order});
  final StoreOrder order;

  @override
  Widget build(BuildContext context) {
    final first = order.items.isNotEmpty ? order.items.first : null;
    final more = order.items.length - 1;
    final color = switch (order.status) {
      'confirmed' => const Color(0xFF1E6FD6),
      'shipped' => const Color(0xFF7A3FD0),
      'delivered' => Mall.green,
      'cancelled' => Mall.offInk,
      _ => Mall.warmGrey,
    };
    return GestureDetector(
      onTap: () => context.push('/store/order/${order.id}'),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFF0EAdb))),
        child: Column(
          children: [
            Row(
              children: [
                Text(order.orderNo, style: const TextStyle(fontWeight: FontWeight.w800, color: Mall.navy)),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
                  child: Text(_statusLabel[order.status] ?? order.status, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 11.5)),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                SizedBox(width: 48, height: 48, child: MallImage(url: first?.image, size: 20, radius: 11)),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(first?.title ?? 'Order', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: Mall.navy)),
                      if (more > 0) Padding(padding: const EdgeInsets.only(top: 2), child: Text('+ $more more item${more == 1 ? '' : 's'}', style: const TextStyle(fontSize: 12, color: Mall.warmGrey))),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text(Mall.rupees(order.totalPaise), style: const TextStyle(fontWeight: FontWeight.w800, color: Mall.ink)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
