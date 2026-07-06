import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../data/astrologer_repository.dart';
import '../../ui/celestial.dart';
import '../consultation/astrologer_consultation_screen.dart';

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
    final todayEarn = todayDone.fold<int>(0, (a, r) => a + r.c.totalCharged);

    final online = self?.onlineStatus ?? false;

    return SkyScaffold(
      child: RefreshIndicator(
        color: Sky.purple,
        onRefresh: () async => ref.invalidate(sessionRowsProvider),
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            _header(context, self),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _onlineCard(context, ref, self, uid, online),
                  const SizedBox(height: 14),
                  _earningsHero(todayEarn, todayDone.length),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: StatTile(
                          label: 'Wallet balance',
                          value: Money.formatPaise(self?.pendingPayout ?? 0),
                          icon: Icons.account_balance_wallet_rounded,
                          accent: Sky.purple,
                          sub: 'Available',
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: StatTile(
                          label: "Today's sessions",
                          value: '${todayDone.length}',
                          icon: Icons.event_available_rounded,
                          accent: Sky.gold,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: StatTile(
                          label: 'Your rating',
                          value: '${(self?.rating ?? 0).toStringAsFixed(1)}★',
                          icon: Icons.star_rounded,
                          accent: Sky.amber,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: StatTile(
                          label: 'Avg response',
                          value: _resp(self?.responseTimeSec ?? 0),
                          icon: Icons.bolt_rounded,
                          accent: Sky.green,
                        ),
                      ),
                    ],
                  ),
                  if (active.isNotEmpty) ...[
                    const SizedBox(height: 22),
                    const SectionTitle('Active now'),
                    for (final r in active)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _ActiveCard(row: r, onTap: self == null ? null : () => _open(context, r.c, self)),
                      ),
                  ],
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

  Widget _header(BuildContext context, Astrologer? self) {
    final topPad = MediaQuery.of(context).padding.top;
    final name = (self?.name ?? 'Astrologer').split(' ').first;
    return Container(
      decoration: const BoxDecoration(
        gradient: Sky.lavGrad,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
      ),
      padding: EdgeInsets.fromLTRB(18, topPad + 14, 18, 8),
      child: Row(
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
                Text('Namaste,', style: Sky.label.copyWith(fontSize: 12.5)),
                Text(name, style: Sky.h1.copyWith(fontSize: 20)),
              ],
            ),
          ),
          if (self?.verified ?? false) const Pill('✦ Verified', color: Sky.gold),
        ],
      ),
    );
  }

  Widget _onlineCard(BuildContext context, WidgetRef ref, Astrologer? self, String? uid, bool online) {
    return SkyCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
              color: online ? Sky.green : Sky.ink3,
              shape: BoxShape.circle,
              boxShadow: online ? [BoxShadow(color: Sky.green.withValues(alpha: 0.5), blurRadius: 8)] : null,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(online ? "You're online" : "You're offline", style: Sky.h2.copyWith(fontSize: 15.5)),
                Text(online ? 'Receiving consultation requests' : 'Go online to take consultations',
                    style: Sky.label.copyWith(fontSize: 12)),
              ],
            ),
          ),
          Switch(
            value: online,
            activeColor: Colors.white,
            activeTrackColor: Sky.green,
            onChanged: uid == null
                ? null
                : (v) => ref.read(astrologerRepositoryProvider).setOnline(uid, v),
          ),
        ],
      ),
    );
  }

  Widget _earningsHero(int paise, int count) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        gradient: Sky.heroGrad,
        borderRadius: BorderRadius.circular(22),
        boxShadow: Sky.lift,
      ),
      child: Stack(
        children: [
          const Positioned.fill(child: CelestialWash()),
          Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("TODAY'S EARNINGS", style: Sky.kicker.copyWith(color: Sky.goldSoft)),
                const SizedBox(height: 8),
                Text(Money.formatPaise(paise),
                    style: Sky.display.copyWith(color: Colors.white, fontSize: 34)),
                const SizedBox(height: 6),
                Text('$count ${count == 1 ? 'consultation' : 'consultations'} completed today',
                    style: Sky.label.copyWith(color: Colors.white.withValues(alpha: 0.82), fontSize: 12.5)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _emptyRequests(bool online) {
    return SkyCard(
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

class _ActiveCard extends ConsumerWidget {
  const _ActiveCard({required this.row, required this.onTap});
  final SessionRow row;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = row.c;
    final cust = ref.watch(customerProvider(c.customerId)).valueOrNull;
    final paused = c.status == ConsultationStatus.paused;
    return SkyCard(
      onTap: onTap,
      gradient: Sky.heroGrad,
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          AppAvatar(name: cust?.name ?? 'Customer', photoUrl: cust?.profilePhoto, size: 42),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(cust?.name ?? 'Customer',
                    style: Sky.h2.copyWith(color: Colors.white, fontSize: 14.5),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text('${paused ? 'Paused' : 'Live'} · ${c.type.name} · ${Money.formatDuration(c.billedSeconds)}',
                    style: Sky.label.copyWith(color: Colors.white.withValues(alpha: 0.85), fontSize: 12)),
              ],
            ),
          ),
          const Icon(Icons.arrow_forward_ios_rounded, color: Colors.white, size: 15),
        ],
      ),
    );
  }
}
