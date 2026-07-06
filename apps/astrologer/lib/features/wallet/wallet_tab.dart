import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../data/astrologer_repository.dart';
import '../../ui/celestial.dart';

class WalletTab extends ConsumerStatefulWidget {
  const WalletTab({super.key});
  @override
  ConsumerState<WalletTab> createState() => _WalletTabState();
}

class _WalletTabState extends ConsumerState<WalletTab> {
  bool _requesting = false;

  Future<void> _requestPayout(Astrologer self) async {
    if (self.pendingPayout <= 0) return;
    final upi = await _askUpi();
    if (upi == null || upi.trim().isEmpty) return;
    setState(() => _requesting = true);
    try {
      final open = await ref
          .read(firestoreProvider)
          .collection('payouts')
          .where('astrologerId', isEqualTo: self.id)
          .get();
      final hasOpen = open.docs.any((d) {
        final s = d.data()['status'] as String?;
        return s == 'pending' || s == 'approved';
      });
      if (hasOpen) {
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(const SnackBar(content: Text('You already have a payout in progress.')));
        }
        return;
      }
      await ref.read(firestoreProvider).collection('payouts').add({
        'astrologerId': self.id,
        'astrologerName': self.name,
        'amount': self.pendingPayout,
        'method': 'upi',
        'upi': upi.trim(),
        'status': 'pending',
        'createdAt': FieldValue.serverTimestamp(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Payout requested.')));
      }
    } finally {
      if (mounted) setState(() => _requesting = false);
    }
  }

  Future<String?> _askUpi() {
    final c = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: Sky.card,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('Withdraw to UPI', style: Sky.h2),
        content: TextField(
          controller: c,
          decoration: InputDecoration(
            hintText: 'name@bank',
            filled: true,
            fillColor: Sky.surface,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text('Cancel', style: Sky.label)),
          TextButton(
              onPressed: () => Navigator.pop(context, c.text),
              child: Text('Request', style: Sky.label.copyWith(color: Sky.purple, fontWeight: FontWeight.w800))),
        ],
      ),
    );
  }

  int _sumSince(List<SessionRow> rows, int sinceMs) => rows
      .where((r) => r.c.status.isTerminal && (r.createdAtMs ?? 0) >= sinceMs)
      .fold<int>(0, (a, r) => a + r.c.totalCharged);

  @override
  Widget build(BuildContext context) {
    final self = ref.watch(selfProvider).valueOrNull;
    final rows = ref.watch(sessionRowsProvider).valueOrNull ?? const <SessionRow>[];
    final payouts = ref.watch(payoutsProvider).valueOrNull ?? const [];
    final topPad = MediaQuery.of(context).padding.top;

    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day).millisecondsSinceEpoch;
    final week = today - 6 * 86400000;
    final month = today - 29 * 86400000;

    return SkyScaffold(
      child: ListView(
        padding: EdgeInsets.fromLTRB(16, topPad + 14, 16, 30),
        children: [
          Text('Wallet', style: Sky.h1),
          const SizedBox(height: 14),
          // Available-to-withdraw hero.
          Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(gradient: Sky.heroGrad, borderRadius: BorderRadius.circular(22), boxShadow: Sky.lift),
            child: Stack(
              children: [
                const Positioned.fill(child: CelestialWash()),
                Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('AVAILABLE TO WITHDRAW', style: Sky.kicker.copyWith(color: Sky.goldSoft)),
                      const SizedBox(height: 8),
                      Text(Money.formatPaise(self?.pendingPayout ?? 0),
                          style: Sky.display.copyWith(color: Colors.white, fontSize: 34)),
                      const SizedBox(height: 14),
                      GoldButton(
                        label: 'Withdraw',
                        icon: Icons.account_balance_rounded,
                        loading: _requesting,
                        onPressed: (self == null || _requesting || self.pendingPayout <= 0)
                            ? null
                            : () => _requestPayout(self),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: _earnCard('Today', _sumSince(rows, today))),
              const SizedBox(width: 12),
              Expanded(child: _earnCard('This week', _sumSince(rows, week))),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _earnCard('This month', _sumSince(rows, month))),
              const SizedBox(width: 12),
              Expanded(child: _earnCard('Lifetime', self?.earnings ?? 0, accent: Sky.gold)),
            ],
          ),
          const SizedBox(height: 22),
          const SectionTitle('Last 7 days'),
          _WeekChart(rows: rows),
          const SizedBox(height: 22),
          const SectionTitle('Transactions'),
          if (payouts.isEmpty)
            SkyCard(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Center(child: Text('No withdrawals yet.', style: Sky.label)),
              ),
            )
          else
            for (final p in payouts)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _payoutRow(p),
              ),
        ],
      ),
    );
  }

  Widget _earnCard(String label, int paise, {Color accent = Sky.purple}) {
    return SkyCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: Sky.label.copyWith(fontSize: 10.5, color: accent, fontWeight: FontWeight.w800, letterSpacing: 0.5)),
          const SizedBox(height: 8),
          Text(Money.formatPaise(paise), style: Sky.figure.copyWith(fontSize: 20)),
        ],
      ),
    );
  }

  Widget _payoutRow(Map<String, dynamic> p) {
    final status = (p['status'] ?? 'pending') as String;
    final color = status == 'processed' ? Sky.green : status == 'rejected' ? Sky.red : Sky.amber;
    final ts = p['createdAt'];
    final ms = ts is Timestamp ? ts.millisecondsSinceEpoch : null;
    return SkyCard(
      padding: const EdgeInsets.all(13),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
            child: Icon(Icons.north_east_rounded, size: 18, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Withdrawal', style: Sky.h2.copyWith(fontSize: 14)),
                Text(ms == null ? 'UPI' : _date(ms), style: Sky.label.copyWith(fontSize: 12)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(Money.formatPaise((p['amount'] ?? 0) as int), style: Sky.h2.copyWith(fontSize: 14)),
              const SizedBox(height: 3),
              Pill(status[0].toUpperCase() + status.substring(1), color: color),
            ],
          ),
        ],
      ),
    );
  }

  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  String _date(int ms) {
    final d = DateTime.fromMillisecondsSinceEpoch(ms);
    return '${d.day} ${_months[d.month - 1]}';
  }
}

class _WeekChart extends StatelessWidget {
  const _WeekChart({required this.rows});
  final List<SessionRow> rows;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    final totals = List<int>.filled(7, 0);
    for (var i = 0; i < 7; i++) {
      final day = DateTime(now.year, now.month, now.day).subtract(Duration(days: 6 - i));
      final start = day.millisecondsSinceEpoch;
      final end = start + 86400000;
      for (final r in rows) {
        final ms = r.createdAtMs;
        if (r.c.status.isTerminal && ms != null && ms >= start && ms < end) {
          totals[i] += r.c.totalCharged;
        }
      }
    }
    final maxV = totals.fold<int>(1, (a, b) => b > a ? b : a);
    final anyData = totals.any((t) => t > 0);

    return SkyCard(
      child: SizedBox(
        height: 140,
        child: anyData
            ? Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (var i = 0; i < 7; i++)
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Container(
                            margin: const EdgeInsets.symmetric(horizontal: 5),
                            height: (96 * (totals[i] / maxV)).clamp(3, 96).toDouble(),
                            decoration: BoxDecoration(
                              gradient: totals[i] == maxV ? Sky.goldGrad : Sky.heroGrad,
                              borderRadius: const BorderRadius.vertical(top: Radius.circular(7)),
                            ),
                          ),
                          const SizedBox(height: 7),
                          Text(
                              labels[DateTime(now.year, now.month, now.day)
                                      .subtract(Duration(days: 6 - i))
                                      .weekday %
                                  7],
                              style: Sky.label.copyWith(fontSize: 10.5)),
                        ],
                      ),
                    ),
                ],
              )
            : Center(child: Text('No earnings in the last 7 days.', style: Sky.label)),
      ),
    );
  }
}
