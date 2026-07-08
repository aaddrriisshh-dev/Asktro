import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../data/astrologer_repository.dart';
import '../../ui/celestial.dart';
import '../consultation/astrologer_consultation_screen.dart';
import 'reviews_screen.dart';

class HomeTab extends ConsumerWidget {
  const HomeTab({super.key});

  void _open(BuildContext context, Consultation c, Astrologer self) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => AstrologerConsultationScreen(consultationId: c.id, self: self),
    ));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final self = ref.watch(selfProvider).valueOrNull;
    final rows = ref.watch(sessionRowsProvider).valueOrNull ?? const <SessionRow>[];
    final uid = ref.watch(currentUidProvider);

    final pending = rows.where((r) => r.c.status == ConsultationStatus.waiting).toList();
    final active = rows
        .where((r) => r.c.status == ConsultationStatus.active || r.c.status == ConsultationStatus.paused)
        .toList();
    final todayDone = rows.where((r) => r.isToday && r.c.status.isTerminal).toList();
    // NET (after commission) so it matches the withdrawable/pending payout the
    // astrologer is actually paid — not the gross customer charge.
    final todayEarn =
        todayDone.fold<int>(0, (a, r) => a + (self?.netOf(r.c.totalCharged) ?? r.c.totalCharged));

    final online = self?.onlineStatus ?? false;

    // Repeat clients = customers with >1 finished session (from loaded rows).
    // Recent = finished sessions, newest first.
    final counts = <String, int>{};
    for (final r in rows) {
      if (r.c.status.isTerminal) counts[r.c.customerId] = (counts[r.c.customerId] ?? 0) + 1;
    }
    final repeatClients = counts.values.where((n) => n > 1).length;
    final recent = rows.where((r) => r.c.status.isTerminal).toList()
      ..sort((a, b) => (b.createdAtMs ?? 0).compareTo(a.createdAtMs ?? 0));
    // Latest announcement the astrologer has received (reuses their notifications).
    final notifs = ref.watch(notificationsProvider).valueOrNull ?? const [];

    return SkyScaffold(
      child: RefreshIndicator(
        color: Sky.purple,
        onRefresh: () async => ref.invalidate(sessionRowsProvider),
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            _header(context, ref, self, uid, online, todayEarn, self?.pendingPayout ?? 0),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // ---- stat grid (3 × 2) ----
                  Row(children: [
                    Expanded(child: StatTile(label: "Today's sessions", value: '${todayDone.length}', icon: Icons.event_available_rounded, accent: Sky.purple)),
                    const SizedBox(width: 12),
                    Expanded(child: StatTile(label: 'Your rating', value: '${(self?.rating ?? 0).toStringAsFixed(1)}★', icon: Icons.star_rounded, accent: Sky.amber)),
                  ]),
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(child: StatTile(label: 'Avg response', value: _resp(self?.responseTimeSec ?? 0), icon: Icons.bolt_rounded, accent: Sky.green)),
                    const SizedBox(width: 12),
                    Expanded(child: StatTile(label: 'Total sessions', value: '${self?.totalConsultations ?? 0}', icon: Icons.forum_rounded, accent: Sky.purple)),
                  ]),
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(child: StatTile(label: 'Repeat clients', value: '$repeatClients', icon: Icons.autorenew_rounded, accent: Sky.amber)),
                    const SizedBox(width: 12),
                    Expanded(child: StatTile(label: 'Followers', value: '${self?.followers ?? 0}', icon: Icons.favorite_rounded, accent: Sky.green)),
                  ]),

                  // ---- active chats quick row ----
                  if (active.isNotEmpty) ...[
                    const SizedBox(height: 22),
                    const SectionTitle('Active chats'),
                    const SizedBox(height: 12),
                    _ActiveChips(active: active, onOpen: (c) { if (self != null) _open(context, c, self); }),
                  ],

                  // ---- requests ----
                  const SizedBox(height: 22),
                  SectionTitle('Requests${pending.isEmpty ? '' : ' · ${pending.length}'}'),
                  if (pending.isEmpty)
                    _emptyRequests(online)
                  else
                    for (final r in pending)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _RequestCard(row: r, onOpen: self == null ? null : () => _open(context, r.c, self)),
                      ),

                  // ---- earnings chart ----
                  const SizedBox(height: 22),
                  _weeklyTrend(rows, self),

                  // ---- quick actions ----
                  const SizedBox(height: 22),
                  const SectionTitle('Quick actions'),
                  const SizedBox(height: 12),
                  _quickActions(context, ref),

                  // ---- recent clients ----
                  if (recent.isNotEmpty) ...[
                    const SizedBox(height: 22),
                    const SectionTitle('Recent clients'),
                    const SizedBox(height: 12),
                    _RecentClients(rows: recent.take(4).toList(), self: self),
                  ],

                  // ---- announcement ----
                  if (notifs.isNotEmpty) ...[
                    const SizedBox(height: 22),
                    const SectionTitle('From Asktro'),
                    const SizedBox(height: 12),
                    _announcement(notifs.first),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _resp(int sec) {
    if (sec <= 0) return '—';
    if (sec < 60) return '${sec}s';
    return '${(sec / 60).toStringAsFixed(sec % 60 == 0 ? 0 : 1)}m';
  }

  // Celestial header that carries the money up top (banking-app style): greeting
  // + online toggle, then Today's earnings and Wallet as two glass blocks.
  Widget _header(BuildContext context, WidgetRef ref, Astrologer? self, String? uid, bool online, int todayEarn, int wallet) {
    final topPad = MediaQuery.of(context).padding.top;
    final name = (self?.name ?? 'Astrologer').split(' ').first;
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(
        gradient: Sky.heroGrad,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(30)),
      ),
      child: Stack(
        children: [
          const Positioned.fill(child: CelestialWash()),
          Padding(
            padding: EdgeInsets.fromLTRB(18, topPad + 14, 18, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(2),
                      decoration: const BoxDecoration(shape: BoxShape.circle, gradient: Sky.goldGrad),
                      child: AppAvatar(name: self?.name ?? 'You', photoUrl: self?.profilePhoto, size: 46),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Namaste,', style: Sky.label.copyWith(fontSize: 12, color: Colors.white70)),
                          Row(
                            children: [
                              Flexible(
                                child: Text(name,
                                    style: Sky.h1.copyWith(fontSize: 21, color: Colors.white),
                                    overflow: TextOverflow.ellipsis),
                              ),
                              if (self?.verified ?? false) ...[
                                const SizedBox(width: 6),
                                const Icon(Icons.verified_rounded, size: 16, color: Sky.goldSoft),
                              ],
                            ],
                          ),
                        ],
                      ),
                    ),
                    Column(
                      children: [
                        OnlineToggle(
                          value: online,
                          onChanged: uid == null ? null : (v) => ref.read(astrologerRepositoryProvider).setOnline(uid, v),
                        ),
                        const SizedBox(height: 4),
                        Text(online ? 'Online' : 'Offline',
                            style: Sky.label.copyWith(
                                fontSize: 10, fontWeight: FontWeight.w800, color: online ? Sky.goldSoft : Colors.white54)),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(child: _glassStat("Today's earnings", Money.formatPaise(todayEarn), Icons.trending_up_rounded)),
                    const SizedBox(width: 12),
                    Expanded(child: _glassStat('Wallet balance', Money.formatPaise(wallet), Icons.account_balance_wallet_rounded)),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _glassStat(String label, String value, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.13),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 13, color: Sky.goldSoft),
              const SizedBox(width: 6),
              Expanded(
                child: Text(label.toUpperCase(),
                    style: Sky.label.copyWith(
                        fontSize: 9.5, color: Colors.white70, letterSpacing: 0.4, fontWeight: FontWeight.w700),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(value, style: Sky.figure.copyWith(fontSize: 21, color: Colors.white)),
        ],
      ),
    );
  }

  // A slim weekly-earnings trend with a sparkline — the "graph going with the
  // flow" from the reference. Uses real last-7-day earnings; falls back to a
  // gentle curve when there's no data yet.
  Widget _weeklyTrend(List<SessionRow> rows, Astrologer? self) {
    final now = DateTime.now();
    final pts = <double>[];
    for (var i = 6; i >= 0; i--) {
      final day = DateTime(now.year, now.month, now.day).subtract(Duration(days: i));
      final start = day.millisecondsSinceEpoch;
      final end = start + 86400000;
      var sum = 0;
      for (final r in rows) {
        final ms = r.createdAtMs;
        if (r.c.status.isTerminal && ms != null && ms >= start && ms < end) {
          sum += self?.netOf(r.c.totalCharged) ?? r.c.totalCharged; // net, after commission
        }
      }
      pts.add(sum.toDouble());
    }
    final total = pts.fold<double>(0, (a, b) => a + b);
    final hasData = pts.any((p) => p > 0);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Sky.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Sky.line),
        boxShadow: Sky.soft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.trending_up_rounded, size: 16, color: Sky.purple),
              const SizedBox(width: 7),
              Text('This week', style: Sky.h2.copyWith(fontSize: 14)),
              const Spacer(),
              Text(Money.formatPaise(total.round()), style: Sky.h2.copyWith(fontSize: 15, color: Sky.purple)),
            ],
          ),
          const SizedBox(height: 14),
          Sparkline(
            points: hasData ? pts : const [1, 2.4, 1.8, 3.2, 2.6, 4, 3.4],
            color: Sky.purple,
            height: 46,
          ),
        ],
      ),
    );
  }

  Widget _emptyRequests(bool online) {
    return SizedBox(
      width: double.infinity,
      child: SkyCard(
      child: Column(
        children: [
          const SizedBox(height: 6),
          Icon(Icons.inbox_rounded, size: 40, color: Sky.ink3),
          const SizedBox(height: 10),
          Text('No new requests', style: Sky.h2.copyWith(fontSize: 15)),
          const SizedBox(height: 4),
          Text(online ? 'New consultations will appear here.' : 'Go online to start receiving requests.',
              style: Sky.label.copyWith(fontSize: 12.5), textAlign: TextAlign.center),
          const SizedBox(height: 6),
        ],
      ),
      ),
    );
  }

  // ---- quick actions grid ----
  Widget _quickActions(BuildContext context, WidgetRef ref) {
    void tab(int i) => ref.read(dashTabProvider.notifier).state = i;
    final items = <(IconData, String, VoidCallback)>[
      (Icons.people_alt_rounded, 'My clients', () => tab(1)),
      (Icons.payments_rounded, 'Payouts', () => tab(2)),
      (Icons.star_rounded, 'Reviews',
          () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ReviewsScreen()))),
      (Icons.trending_up_rounded, 'Earnings', () => tab(2)),
      (Icons.toggle_on_rounded, 'Availability', () => _availabilitySheet(context, ref)),
      (Icons.headset_mic_rounded, 'Support', () => tab(4)),
    ];
    return GridView.count(
      crossAxisCount: 3,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.05,
      children: [for (final it in items) _qaTile(it.$1, it.$2, it.$3)],
    );
  }

  Widget _qaTile(IconData icon, String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        decoration: BoxDecoration(
          color: Sky.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Sky.line),
          boxShadow: Sky.soft,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(color: Sky.purple.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(11)),
              child: Icon(icon, color: Sky.purple, size: 19),
            ),
            const SizedBox(height: 8),
            Text(label, style: Sky.label.copyWith(fontSize: 11, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }

  void _availabilitySheet(BuildContext context, WidgetRef ref) {
    final uid = ref.read(currentUidProvider);
    showModalBottomSheet(
      context: context,
      backgroundColor: Sky.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(26))),
      builder: (ctx) => Consumer(builder: (ctx, r, _) {
        final online = r.watch(selfProvider).valueOrNull?.onlineStatus ?? false;
        return Padding(
          padding: EdgeInsets.fromLTRB(22, 20, 22, 26 + MediaQuery.of(ctx).padding.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Availability', style: Sky.h2),
              const SizedBox(height: 5),
              Text(
                online
                    ? "You're online — visible to clients and receiving requests."
                    : "You're offline — clients can't reach you right now.",
                style: Sky.label.copyWith(fontSize: 12.5),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: Text(online ? 'Online' : 'Offline',
                        style: Sky.h2.copyWith(fontSize: 16, color: online ? Sky.green : Sky.ink3)),
                  ),
                  OnlineToggle(
                    value: online,
                    onChanged: uid == null ? null : (v) => r.read(astrologerRepositoryProvider).setOnline(uid, v),
                  ),
                ],
              ),
            ],
          ),
        );
      }),
    );
  }

  Widget _announcement(Map<String, dynamic> n) {
    final body = (n['body'] ?? '').toString();
    return SkyCard(
      padding: const EdgeInsets.all(13),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(gradient: Sky.goldGrad, borderRadius: BorderRadius.circular(11)),
            child: const Icon(Icons.campaign_rounded, color: Sky.purpleDeep, size: 19),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text((n['title'] ?? 'Announcement').toString(),
                    style: Sky.h2.copyWith(fontSize: 13.5), maxLines: 1, overflow: TextOverflow.ellipsis),
                if (body.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(body, style: Sky.label.copyWith(fontSize: 11.5), maxLines: 2, overflow: TextOverflow.ellipsis),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

IconData typeIcon(ConsultationType t) {
  switch (t) {
    case ConsultationType.voice:
      return Icons.call_rounded;
    case ConsultationType.video:
      return Icons.videocam_rounded;
    case ConsultationType.chat:
      return Icons.chat_bubble_rounded;
  }
}

class _RequestCard extends ConsumerWidget {
  const _RequestCard({required this.row, required this.onOpen});
  final SessionRow row;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = row.c;
    final cust = ref.watch(customerProvider(c.customerId)).valueOrNull;
    return SkyCard(
      onTap: onOpen,
      padding: const EdgeInsets.all(13),
      child: Row(
        children: [
          Stack(
            children: [
              AppAvatar(name: cust?.name ?? 'Guest', photoUrl: cust?.profilePhoto, size: 46),
              Positioned(
                right: -2,
                bottom: -2,
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: const BoxDecoration(color: Sky.card, shape: BoxShape.circle),
                  child: Container(
                    padding: const EdgeInsets.all(3),
                    decoration: BoxDecoration(color: Sky.purple.withValues(alpha: 0.12), shape: BoxShape.circle),
                    child: Icon(typeIcon(c.type), size: 11, color: Sky.purple),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(cust?.name ?? 'New customer',
                    style: Sky.h2.copyWith(fontSize: 14.5), maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 3),
                Text('New ${c.type.name} request',
                    style: Sky.label.copyWith(fontSize: 12, color: Sky.gold, fontWeight: FontWeight.w700)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
            decoration: BoxDecoration(gradient: Sky.goldGrad, borderRadius: BorderRadius.circular(12)),
            child: Text('Accept', style: Sky.label.copyWith(color: Sky.purpleDeep, fontWeight: FontWeight.w800, fontSize: 13)),
          ),
        ],
      ),
    );
  }
}

/// Horizontal quick-access row of the astrologer's live/paused chats.
class _ActiveChips extends StatelessWidget {
  const _ActiveChips({required this.active, required this.onOpen});
  final List<SessionRow> active;
  final void Function(Consultation) onOpen;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 82,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: active.length,
        separatorBuilder: (_, __) => const SizedBox(width: 14),
        itemBuilder: (_, i) => _ActiveChip(row: active[i], onTap: () => onOpen(active[i].c)),
      ),
    );
  }
}

class _ActiveChip extends ConsumerWidget {
  const _ActiveChip({required this.row, required this.onTap});
  final SessionRow row;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = row.c;
    final cust = ref.watch(customerProvider(c.customerId)).valueOrNull;
    final paused = c.status == ConsultationStatus.paused;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 56,
        child: Column(
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                AppAvatar(name: cust?.name ?? 'Customer', photoUrl: cust?.profilePhoto, size: 52),
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Container(
                    width: 13,
                    height: 13,
                    decoration: BoxDecoration(
                      color: paused ? Sky.amber : Sky.green,
                      shape: BoxShape.circle,
                      border: Border.all(color: Sky.bg, width: 2),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text((cust?.name ?? 'Customer').split(' ').first,
                style: Sky.label.copyWith(fontSize: 10.5), maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }
}

/// Recent finished sessions with per-session net earning.
class _RecentClients extends StatelessWidget {
  const _RecentClients({required this.rows, required this.self});
  final List<SessionRow> rows;
  final Astrologer? self;

  @override
  Widget build(BuildContext context) {
    return SkyCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
      child: Column(children: [for (final r in rows) _RecentRow(row: r, self: self)]),
    );
  }
}

class _RecentRow extends ConsumerWidget {
  const _RecentRow({required this.row, required this.self});
  final SessionRow row;
  final Astrologer? self;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = row.c;
    final cust = ref.watch(customerProvider(c.customerId)).valueOrNull;
    final earned = self?.netOf(c.totalCharged) ?? c.totalCharged;
    final label = '${c.type.name[0].toUpperCase()}${c.type.name.substring(1)}';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 9),
      child: Row(
        children: [
          AppAvatar(name: cust?.name ?? 'Customer', photoUrl: cust?.profilePhoto, size: 36),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(cust?.name ?? 'Customer',
                    style: Sky.h2.copyWith(fontSize: 13.5), maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text('$label · ${Money.formatDuration(c.billedSeconds)}', style: Sky.label.copyWith(fontSize: 11.5)),
              ],
            ),
          ),
          Text(Money.formatPaise(earned), style: Sky.h2.copyWith(fontSize: 13, color: Sky.green)),
        ],
      ),
    );
  }
}
