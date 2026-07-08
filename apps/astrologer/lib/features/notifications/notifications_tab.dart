import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../ui/celestial.dart';

class NotificationsTab extends ConsumerWidget {
  const NotificationsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(notificationsProvider).valueOrNull ?? const <Map<String, dynamic>>[];
    final topPad = MediaQuery.of(context).padding.top;

    return SkyScaffold(
      child: ListView(
        padding: EdgeInsets.fromLTRB(16, topPad + 14, 16, 30),
        children: [
          Text('Notifications', style: Sky.h1),
          const SizedBox(height: 14),
          if (items.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 80),
              child: Column(
                children: [
                  const Icon(Icons.notifications_none_rounded, size: 46, color: Sky.ink3),
                  const SizedBox(height: 12),
                  Text('No notifications yet', style: Sky.h2.copyWith(fontSize: 15)),
                  const SizedBox(height: 4),
                  Text('Requests, payments and reviews will appear here.',
                      style: Sky.label.copyWith(fontSize: 12.5), textAlign: TextAlign.center,),
                ],
              ),
            )
          else
            for (final n in items)
              Padding(padding: const EdgeInsets.only(bottom: 10), child: _row(n)),
        ],
      ),
    );
  }

  ({IconData icon, Color color}) _visual(String type) {
    switch (type) {
      case 'payout':
      case 'payment':
        return (icon: Icons.payments_rounded, color: Sky.green);
      case 'withdrawal':
        return (icon: Icons.account_balance_rounded, color: Sky.purple);
      case 'review':
      case 'rating':
        return (icon: Icons.star_rounded, color: Sky.amber);
      case 'consultation':
      case 'request':
        return (icon: Icons.chat_bubble_rounded, color: Sky.purple);
      default:
        return (icon: Icons.campaign_rounded, color: Sky.gold);
    }
  }

  Widget _row(Map<String, dynamic> n) {
    final v = _visual((n['type'] ?? '') as String);
    final read = n['read'] == true;
    final ts = n['createdAt'];
    final ms = ts is Timestamp ? ts.millisecondsSinceEpoch : null;
    return SkyCard(
      padding: const EdgeInsets.all(13),
      color: read ? Sky.card : Sky.surface,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: v.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
            child: Icon(v.icon, size: 19, color: v.color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text((n['title'] ?? 'Notification') as String, style: Sky.h2.copyWith(fontSize: 14)),
                if ((n['body'] ?? '').toString().isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(n['body'] as String, style: Sky.label.copyWith(fontSize: 12.5, height: 1.35)),
                ],
                if (ms != null) ...[
                  const SizedBox(height: 5),
                  Text(_ago(ms), style: Sky.label.copyWith(fontSize: 11, color: Sky.ink3)),
                ],
              ],
            ),
          ),
          if (!read)
            Container(
              margin: const EdgeInsets.only(left: 6, top: 4),
              width: 8,
              height: 8,
              decoration: const BoxDecoration(color: Sky.gold, shape: BoxShape.circle),
            ),
        ],
      ),
    );
  }

  String _ago(int ms) {
    final m = (DateTime.now().millisecondsSinceEpoch - ms) ~/ 60000;
    if (m < 1) return 'Just now';
    if (m < 60) return '${m}m ago';
    final h = m ~/ 60;
    if (h < 24) return '${h}h ago';
    return '${h ~/ 24}d ago';
  }
}
