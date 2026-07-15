import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'store_home_screen.dart' show MallAppBar;
import 'store_models.dart';
import 'store_providers.dart';
import 'store_theme.dart';
import 'store_widgets.dart';

const _statusFlow = ['confirmed', 'shipped', 'delivered'];
const _statusLabel = {
  'pending_payment': 'Pending payment',
  'confirmed': 'Confirmed',
  'shipped': 'Shipped',
  'delivered': 'Delivered',
  'cancelled': 'Cancelled',
};

/// One order — used both as the post-payment confirmation (`placed=1`) and from
/// "My Orders". Shows the live fulfilment status, items, and delivery address.
class OrderDetailScreen extends ConsumerWidget {
  const OrderDetailScreen({super.key, required this.orderId, this.justPlaced = false});
  final String orderId;
  final bool justPlaced;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final order = ref.watch(storeOrderProvider(orderId));

    return Scaffold(
      backgroundColor: const Color(0xFFF8F5FF),
      appBar: MallAppBar(title: justPlaced ? 'Order placed' : 'Order details', showCart: false),
      body: order.when(
        data: (o) => o == null
            ? const Center(child: Text('Order not found.', style: TextStyle(color: Mall.warmGrey)))
            : _body(context, o),
        loading: () => const Center(child: CircularProgressIndicator(color: Mall.deep)),
        error: (_, __) => const Center(child: Text('Could not load this order.', style: TextStyle(color: Mall.warmGrey))),
      ),
      bottomNavigationBar: justPlaced
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: GestureDetector(
                  onTap: () => context.go('/store'),
                  child: Container(
                    height: 52,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(gradient: Mall.goldButton, borderRadius: BorderRadius.circular(15)),
                    child: const Text('Continue shopping', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
                  ),
                ),
              ),
            )
          : null,
    );
  }

  Widget _body(BuildContext context, StoreOrder o) {
    final cancelled = o.status == 'cancelled';
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        if (justPlaced) _successHeader(o),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFF0EAdb)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(o.orderNo, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Mall.navy)),
                  const Spacer(),
                  _statusPill(o.status),
                ],
              ),
              const SizedBox(height: 16),
              if (!cancelled) _tracker(o.status) else const Text('This order was cancelled. Any payment is refunded to your source.', style: TextStyle(color: Mall.offInk, fontSize: 13)),
              if (o.trackingNumber != null && o.trackingNumber!.isNotEmpty) ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(11),
                  decoration: BoxDecoration(color: const Color(0xFFFFFAF0), borderRadius: BorderRadius.circular(11), border: Border.all(color: Mall.goldLine)),
                  child: Row(
                    children: [
                      const Icon(Icons.local_shipping_outlined, size: 18, color: Mall.goldInk),
                      const SizedBox(width: 8),
                      Expanded(child: Text('${o.courier ?? 'Courier'} · ${o.trackingNumber}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Mall.ink))),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        const Text('Items', style: TextStyle(fontFamily: 'serif', fontSize: 18, fontWeight: FontWeight.w700, color: Mall.titleBrown)),
        const SizedBox(height: 8),
        ...o.items.map(_itemRow),
        const SizedBox(height: 8),
        _totals(o),
        const SizedBox(height: 16),
        if (o.address != null) ...[
          const Text('Delivery address', style: TextStyle(fontFamily: 'serif', fontSize: 18, fontWeight: FontWeight.w700, color: Mall.titleBrown)),
          const SizedBox(height: 8),
          _addressCard(o.address!),
        ],
      ],
    );
  }

  Widget _successHeader(StoreOrder o) => Container(
        margin: const EdgeInsets.only(bottom: 18),
        padding: const EdgeInsets.symmetric(vertical: 22),
        alignment: Alignment.center,
        child: Column(
          children: [
            Container(
              width: 64, height: 64,
              decoration: const BoxDecoration(gradient: Mall.goldButton, shape: BoxShape.circle),
              child: const Icon(Icons.check_rounded, color: Colors.white, size: 34),
            ),
            const SizedBox(height: 12),
            const Text('Thank you! Your order is confirmed', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Mall.navy)),
            const SizedBox(height: 4),
            Text("We'll pack ${o.orderNo} and ship it to you soon.", style: const TextStyle(color: Mall.warmGrey, fontSize: 13)),
          ],
        ),
      );

  Widget _statusPill(String status) {
    final label = _statusLabel[status] ?? status;
    final color = switch (status) {
      'confirmed' => const Color(0xFF1E6FD6),
      'shipped' => const Color(0xFF7A3FD0),
      'delivered' => Mall.green,
      'cancelled' => Mall.offInk,
      _ => Mall.warmGrey,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12)),
    );
  }

  Widget _tracker(String status) {
    final idx = _statusFlow.indexOf(status);
    return Row(
      children: List.generate(_statusFlow.length * 2 - 1, (i) {
        if (i.isOdd) {
          final done = (i ~/ 2) < idx;
          return Expanded(child: Container(height: 3, color: done ? Mall.deep : Mall.hair));
        }
        final step = i ~/ 2;
        final done = step <= idx;
        return Column(
          children: [
            Container(
              width: 26, height: 26,
              decoration: BoxDecoration(
                color: done ? Mall.deep : Colors.white,
                shape: BoxShape.circle,
                border: Border.all(color: done ? Mall.deep : Mall.hair, width: 2),
              ),
              child: done ? const Icon(Icons.check, size: 15, color: Colors.white) : null,
            ),
            const SizedBox(height: 4),
            Text(_statusLabel[_statusFlow[step]]!, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: done ? Mall.ink : Mall.warmGrey)),
          ],
        );
      }),
    );
  }

  Widget _itemRow(OrderLine it) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFF0EAdb))),
        child: Row(
          children: [
            SizedBox(width: 46, height: 46, child: MallImage(url: it.image, size: 20, radius: 10)),
            const SizedBox(width: 10),
            Expanded(child: Text(it.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Mall.navy))),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text('× ${it.qty}', style: const TextStyle(fontSize: 12, color: Mall.warmGrey)),
                Text(Mall.rupees(it.lineTotalPaise), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Mall.ink)),
              ],
            ),
          ],
        ),
      );

  Widget _totals(StoreOrder o) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFF0EAdb))),
        child: Column(
          children: [
            _tl('Subtotal', Mall.rupees(o.subtotalPaise)),
            const SizedBox(height: 5),
            _tl('Shipping', o.shippingPaise == 0 ? 'FREE' : Mall.rupees(o.shippingPaise), green: o.shippingPaise == 0),
            const Divider(height: 14),
            _tl('Total paid', Mall.rupees(o.totalPaise), bold: true),
          ],
        ),
      );

  Widget _tl(String k, String v, {bool bold = false, bool green = false}) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(k, style: TextStyle(fontWeight: bold ? FontWeight.w700 : FontWeight.w500, color: bold ? Mall.navy : Mall.warmGrey, fontSize: bold ? 15 : 13)),
          Text(v, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600, color: green ? Mall.green : (bold ? Mall.navy : Mall.ink), fontSize: bold ? 15 : 13)),
        ],
      );

  Widget _addressCard(ShippingAddress a) => Container(
        padding: const EdgeInsets.all(14),
        width: double.infinity,
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFF0EAdb))),
        child: Text(
          '${a.name} · ${a.phone}\n${a.line1}${a.line2.isNotEmpty ? ', ${a.line2}' : ''}'
          '${a.landmark.isNotEmpty ? '\n${a.landmark}' : ''}\n${a.city}, ${a.state} — ${a.pincode}',
          style: const TextStyle(fontSize: 13.5, height: 1.5, color: Mall.ink),
        ),
      );
}
