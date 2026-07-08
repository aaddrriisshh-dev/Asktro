import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../ui/celestial.dart';

/// The astrologer's own reviews — every rated consultation, newest first.
/// Derived from the already-loaded session rows (no extra query / index).
class ReviewsScreen extends ConsumerWidget {
  const ReviewsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = ref.watch(sessionRowsProvider).valueOrNull ?? const <SessionRow>[];
    final self = ref.watch(selfProvider).valueOrNull;
    final rated = rows.where((r) => (r.c.rating ?? 0) > 0).toList()
      ..sort((a, b) => (b.createdAtMs ?? 0).compareTo(a.createdAtMs ?? 0));

    return SkyScaffold(
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 6, 16, 4),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: const Icon(Icons.arrow_back_rounded, color: Sky.ink),
                  ),
                  Text('Reviews', style: Sky.h1.copyWith(fontSize: 22)),
                  const Spacer(),
                  if (self != null && self.rating > 0)
                    Text('${self.rating.toStringAsFixed(1)}★ · ${self.totalReviews}',
                        style: Sky.label.copyWith(color: Sky.gold, fontWeight: FontWeight.w800)),
                ],
              ),
            ),
            Expanded(
              child: rated.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(40),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.star_border_rounded, size: 46, color: Sky.ink3),
                            const SizedBox(height: 12),
                            Text('No reviews yet', style: Sky.h2),
                            const SizedBox(height: 4),
                            Text('Ratings from your consultations will appear here.',
                                style: Sky.label.copyWith(fontSize: 12.5), textAlign: TextAlign.center),
                          ],
                        ),
                      ),
                    )
                  : ListView.separated(
                      padding: EdgeInsets.fromLTRB(16, 8, 16, 24 + MediaQuery.of(context).padding.bottom),
                      itemCount: rated.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, i) => _ReviewCard(row: rated[i]),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReviewCard extends ConsumerWidget {
  const _ReviewCard({required this.row});
  final SessionRow row;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = row.c;
    final cust = ref.watch(customerProvider(c.customerId)).valueOrNull;
    final stars = (c.rating ?? 0).round();
    final review = (c.review ?? '').trim();
    return SkyCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              AppAvatar(name: cust?.name ?? 'Customer', photoUrl: cust?.profilePhoto, size: 34),
              const SizedBox(width: 10),
              Expanded(
                child: Text(cust?.name ?? 'Customer',
                    style: Sky.h2.copyWith(fontSize: 14), maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: List.generate(
                  5,
                  (s) => Icon(s < stars ? Icons.star_rounded : Icons.star_border_rounded,
                      size: 15, color: Sky.gold),
                ),
              ),
            ],
          ),
          if (review.isNotEmpty) ...[
            const SizedBox(height: 9),
            Text(review, style: Sky.body.copyWith(fontSize: 13, height: 1.35)),
          ],
        ],
      ),
    );
  }
}
