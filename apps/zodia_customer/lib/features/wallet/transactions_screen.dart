import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';

/// Read-only wallet ledger for the signed-in customer — every recharge, bonus,
/// consultation spend, report purchase, refund and adjustment, newest first.
/// Sourced from the immutable `walletTransactions` the money functions write.
class TransactionsScreen extends ConsumerWidget {
  const TransactionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uid = ref.watch(currentUidProvider);
    final stream = ref
        .watch(firestoreProvider)
        .collection('walletTransactions')
        .where('userId', isEqualTo: uid)
        .orderBy('createdAt', descending: true)
        .limit(100)
        .snapshots();

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.card,
        foregroundColor: AppColors.textDark,
        title: const Text('Transactions'),
      ),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: stream,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return const EmptyState(
              icon: Icons.receipt_long_rounded,
              title: 'Couldn’t load transactions',
              message: 'Please check your connection and try again.',
            );
          }
          final docs = snap.data?.docs ?? const [];
          if (docs.isEmpty) {
            return const EmptyState(
              icon: Icons.receipt_long_rounded,
              title: 'No transactions yet',
              message: 'Your recharges and spends will appear here.',
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(AppSpacing.lg),
            itemCount: docs.length,
            separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
            itemBuilder: (_, i) => _TxnTile(data: docs[i].data()),
          );
        },
      ),
    );
  }
}

class _TxnTile extends StatelessWidget {
  const _TxnTile({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final amount = (data['amount'] as num?)?.toInt() ?? 0;
    final credit = amount >= 0;
    final kind = (data['kind'] as String?) ?? 'adjustment';
    final note = (data['note'] as String?)?.trim();
    final ts = data['createdAt'];
    final when = ts is Timestamp ? ts.toDate() : null;

    final color = credit ? const Color(0xFF2F9C63) : const Color(0xFFC0392B);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
            child: Icon(_iconFor(kind), size: 21, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_labelFor(kind),
                    style: AppTypography.body.copyWith(fontWeight: FontWeight.w700),),
                if (note != null && note.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(note, style: AppTypography.caption, maxLines: 2, overflow: TextOverflow.ellipsis),
                ],
                if (when != null) ...[
                  const SizedBox(height: 2),
                  Text(_fmtDate(when), style: AppTypography.caption.copyWith(color: AppColors.textSecondary)),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text('${credit ? '+' : '−'}${Money.formatPaise(amount.abs())}',
              style: AppTypography.body.copyWith(fontWeight: FontWeight.w800, color: color),),
        ],
      ),
    );
  }

  static IconData _iconFor(String kind) {
    switch (kind) {
      case 'recharge':
        return Icons.add_card_rounded;
      case 'bonus':
        return Icons.card_giftcard_rounded;
      case 'consultation':
        return Icons.chat_bubble_rounded;
      case 'kundli_match':
        return Icons.favorite_rounded;
      case 'refund':
        return Icons.undo_rounded;
      case 'coupon':
        return Icons.local_offer_rounded;
      default:
        return Icons.tune_rounded;
    }
  }

  static String _labelFor(String kind) {
    switch (kind) {
      case 'recharge':
        return 'Wallet recharge';
      case 'bonus':
        return 'Bonus credit';
      case 'consultation':
        return 'Consultation';
      case 'kundli_match':
        return 'Kundali Match report';
      case 'refund':
        return 'Refund';
      case 'coupon':
        return 'Coupon bonus';
      case 'adjustment':
        return 'Wallet adjustment';
      default:
        final s = kind.replaceAll('_', ' ');
        return s.isEmpty ? 'Transaction' : '${s[0].toUpperCase()}${s.substring(1)}';
    }
  }

  static String _fmtDate(DateTime d) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final ampm = d.hour < 12 ? 'AM' : 'PM';
    final mm = d.minute.toString().padLeft(2, '0');
    return '${d.day} ${months[d.month - 1]} ${d.year}, $h:$mm $ampm';
  }
}
