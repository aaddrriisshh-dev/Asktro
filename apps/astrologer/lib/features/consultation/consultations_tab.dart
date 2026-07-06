import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../data/astrologer_repository.dart';
import '../../ui/celestial.dart';
import '../../ui/customer_insight.dart';
import '../dashboard/home_tab.dart' show typeIcon;
import 'astrologer_consultation_screen.dart';
import 'consultation_details_screen.dart';

class ConsultationsTab extends ConsumerStatefulWidget {
  const ConsultationsTab({super.key});
  @override
  ConsumerState<ConsultationsTab> createState() => _ConsultationsTabState();
}

class _ConsultationsTabState extends ConsumerState<ConsultationsTab> {
  int _tab = 0; // 0 New · 1 Ongoing · 2 Completed

  @override
  Widget build(BuildContext context) {
    final self = ref.watch(selfProvider).valueOrNull;
    final rows = ref.watch(sessionRowsProvider).valueOrNull ?? const <SessionRow>[];

    // Repeat-customer detection: anyone the astrologer has seen more than once.
    final counts = <String, int>{};
    for (final r in rows) {
      counts[r.c.customerId] = (counts[r.c.customerId] ?? 0) + 1;
    }
    final repeats = {for (final e in counts.entries) if (e.value > 1) e.key};

    final buckets = <List<SessionRow>>[
      rows.where((r) => r.c.status == ConsultationStatus.waiting).toList(),
      rows.where((r) => r.c.status == ConsultationStatus.active || r.c.status == ConsultationStatus.paused).toList(),
      rows.where((r) => r.c.status.isTerminal).toList(),
    ];
    final list = buckets[_tab];

    return SkyScaffold(
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 12, 18, 6),
              child: Row(
                children: [
                  Text('Consultations', style: Sky.h1),
                  const Spacer(),
                ],
              ),
            ),
            _segmented(buckets.map((b) => b.length).toList()),
            Expanded(
              child: list.isEmpty
                  ? _empty()
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, i) => _ConsultCard(
                        row: list[i],
                        repeat: repeats.contains(list[i].c.customerId),
                        onTap: () {
                          final c = list[i].c;
                          if (self == null) return;
                          if (c.status.isTerminal) {
                            Navigator.of(context).push(MaterialPageRoute(
                              builder: (_) => ConsultationDetailsScreen(consultation: c, self: self),
                            ));
                          } else {
                            Navigator.of(context).push(MaterialPageRoute(
                              builder: (_) => AstrologerConsultationScreen(consultationId: c.id, self: self),
                            ));
                          }
                        },
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _segmented(List<int> counts) {
    const labels = ['New', 'Ongoing', 'Completed'];
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Sky.surface, borderRadius: BorderRadius.circular(14)),
      child: Row(
        children: [
          for (var i = 0; i < 3; i++)
            Expanded(
              child: GestureDetector(
                onTap: () => setState(() => _tab = i),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  height: 38,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: _tab == i ? Sky.card : Colors.transparent,
                    borderRadius: BorderRadius.circular(11),
                    boxShadow: _tab == i ? Sky.soft : null,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(labels[i],
                          style: Sky.label.copyWith(
                              fontSize: 13,
                              color: _tab == i ? Sky.ink : Sky.ink2,
                              fontWeight: _tab == i ? FontWeight.w800 : FontWeight.w600)),
                      if (counts[i] > 0) ...[
                        const SizedBox(width: 5),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                              color: (i == 0 ? Sky.gold : Sky.purple).withValues(alpha: _tab == i ? 0.16 : 0.10),
                              borderRadius: BorderRadius.circular(999)),
                          child: Text('${counts[i]}',
                              style: Sky.label.copyWith(
                                  fontSize: 10.5, color: i == 0 ? Sky.gold : Sky.purple, fontWeight: FontWeight.w800)),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _empty() {
    const msg = ['No new requests right now.', 'No consultations in progress.', 'No completed consultations yet.'];
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.auto_awesome_rounded, size: 42, color: Sky.ink3),
          const SizedBox(height: 12),
          Text(msg[_tab], style: Sky.label.copyWith(fontSize: 13.5)),
        ],
      ),
    );
  }
}

String relTime(int? ms) {
  if (ms == null) return '';
  final diff = DateTime.now().millisecondsSinceEpoch - ms;
  final m = diff ~/ 60000;
  if (m < 1) return 'just now';
  if (m < 60) return '${m}m ago';
  final h = m ~/ 60;
  if (h < 24) return '${h}h ago';
  return '${h ~/ 24}d ago';
}

class _ConsultCard extends ConsumerWidget {
  const _ConsultCard({required this.row, required this.repeat, required this.onTap});
  final SessionRow row;
  final bool repeat;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = row.c;
    final cust = ref.watch(customerProvider(c.customerId)).valueOrNull;
    final insight = CustomerInsight(cust);
    final meta = <String>[
      if (insight.age != null) '${insight.age} yrs',
      if (insight.birthPlace != 'Not provided') insight.birthPlace,
    ].join(' · ');
    final lang = cust?.languages.isNotEmpty ?? false ? cust!.languages.first : null;

    return SkyCard(
      onTap: onTap,
      padding: const EdgeInsets.all(13),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppAvatar(name: cust?.name ?? 'Guest', photoUrl: cust?.profilePhoto, size: 48),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(cust?.name ?? 'Customer',
                              style: Sky.h2.copyWith(fontSize: 15), maxLines: 1, overflow: TextOverflow.ellipsis),
                        ),
                        if (repeat) ...[const SizedBox(width: 6), const Pill('Repeat', color: Sky.gold)],
                      ],
                    ),
                    if (meta.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(meta, style: Sky.label.copyWith(fontSize: 12)),
                    ],
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(color: Sky.purple.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(11)),
                    child: Icon(typeIcon(c.type), size: 17, color: Sky.purple),
                  ),
                  const SizedBox(height: 6),
                  Text(relTime(row.createdAtMs), style: Sky.label.copyWith(fontSize: 10.5, color: Sky.ink3)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 11),
          Container(height: 1, color: Sky.line),
          const SizedBox(height: 10),
          Row(
            children: [
              if (lang != null) Pill(lang, color: Sky.purple),
              const Spacer(),
              if (c.status.isTerminal && c.duration > 0)
                Text(Money.formatDurationLong(c.duration), style: Sky.label.copyWith(fontSize: 12))
              else if (c.status == ConsultationStatus.waiting)
                Text('Tap to accept →', style: Sky.label.copyWith(fontSize: 12, color: Sky.gold, fontWeight: FontWeight.w700))
              else
                Text('In progress →', style: Sky.label.copyWith(fontSize: 12, color: Sky.green, fontWeight: FontWeight.w700)),
            ],
          ),
        ],
      ),
    );
  }
}
