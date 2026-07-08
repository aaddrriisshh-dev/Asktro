import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../data/astrologer_repository.dart';
import '../../ui/celestial.dart';
import '../consultation/astrologer_consultation_screen.dart';
import 'reviews_screen.dart';

/// The astrologer's home dashboard — a celestial, money-forward control room:
/// a rich hero (identity + live vitals + daily goal), quick actions, an
/// earnings chart, a horizontally-scrolling metric strip, active chats, recent
/// clients and finally the live request queue. Everything is derived from real
/// data (session rows + the astrologer's own profile) — no fabricated ranks or
/// cross-astrologer data.
class HomeTab extends ConsumerWidget {
  const HomeTab({super.key});

  // vivid accents that pop on the purple hero
  static const _cGold = Color(0xFFFFD36E);
  static const _cBlue = Color(0xFF8FD3FF);
  static const _cGreen = Color(0xFF74E6A6);

  void _open(BuildContext context, Consultation c, Astrologer self) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => AstrologerConsultationScreen(consultationId: c.id, self: self),
    ));
  }

  void _tab(WidgetRef ref, int i) => ref.read(dashTabProvider.notifier).state = i;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final self = ref.watch(selfProvider).valueOrNull;
    final rows = ref.watch(sessionRowsProvider).valueOrNull ?? const <SessionRow>[];
    final uid = ref.watch(currentUidProvider);
    final notifs = ref.watch(notificationsProvider).valueOrNull ?? const [];
    final unread = notifs.where((n) => n['read'] != true).length;

    final pending = rows.where((r) => r.c.status == ConsultationStatus.waiting).toList();
    final active = rows
        .where((r) => r.c.status == ConsultationStatus.active || r.c.status == ConsultationStatus.paused)
        .toList();
    final todayDone = rows.where((r) => r.isToday && r.c.status.isTerminal).toList();
    final online = self?.onlineStatus ?? false;

    // ---- earnings buckets: net (after commission) per day, last 7 days ----
    // pts[6] == today, pts[5] == yesterday, … pts[0] == 6 days ago.
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
          sum += self?.netOf(r.c.totalCharged) ?? r.c.totalCharged;
        }
      }
      pts.add(sum.toDouble());
    }
    final todayEarn = pts[6].round();
    final yesterdayEarn = pts[5].round();
    final weekTotal = pts.fold<double>(0, (a, b) => a + b).round();

    // A self-relative daily goal so the progress bar means something without
    // inventing external targets: ~1.1× the trailing-7-day daily average,
    // rounded up to the next ₹100, with a ₹500 floor.
    final avgDay = weekTotal / 7;
    var goal = ((avgDay * 1.1) / 10000).ceil() * 10000;
    if (goal < 50000) goal = 50000;
    final double goalPct = goal == 0 ? 0.0 : (todayEarn / goal).clamp(0.0, 1.0).toDouble();

    // ---- repeat clients + acceptance rate (honest proxies from session rows) ----
    final counts = <String, int>{};
    for (final r in rows) {
      if (r.c.status.isTerminal) counts[r.c.customerId] = (counts[r.c.customerId] ?? 0) + 1;
    }
    final repeatClients = counts.values.where((n) => n > 1).length;

    var accepted = 0, declined = 0;
    for (final r in rows) {
      final s = r.c.status;
      if (s == ConsultationStatus.completed || r.c.billedSeconds > 0) {
        accepted++;
      } else if (s == ConsultationStatus.cancelled || s == ConsultationStatus.expired) {
        declined++;
      }
    }
    final accDen = accepted + declined;
    final acceptance = accDen == 0 ? '—' : '${(accepted / accDen * 100).round()}%';

    final recent = rows.where((r) => r.c.status.isTerminal).toList()
      ..sort((a, b) => (b.createdAtMs ?? 0).compareTo(a.createdAtMs ?? 0));

    return SkyScaffold(
      child: RefreshIndicator(
        color: Sky.purple,
        onRefresh: () async => ref.invalidate(sessionRowsProvider),
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            _header(context, ref, self, uid, online, unread,
                rating: self?.rating ?? 0,
                reviews: self?.totalReviews ?? 0,
                waiting: pending.length,
                todayEarn: todayEarn,
                yesterdayEarn: yesterdayEarn,
                goalPct: goalPct),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // ---- quick actions (tight, right under the header) ----
                  const SectionTitle('Quick actions'),
                  _quickActions(context, ref),

                  // ---- earnings (promoted, nicer graph) ----
                  const SizedBox(height: 24),
                  const SectionTitle('Earnings'),
                  _earnings(ref, pts, todayEarn, yesterdayEarn, weekTotal),

                  // ---- metric strip (horizontal card scroller) ----
                  const SizedBox(height: 24),
                  const SectionTitle('Your numbers'),
                  _statScroller(todayDone.length, self, repeatClients, acceptance),

                  // ---- active chats ----
                  if (active.isNotEmpty) ...[
                    const SizedBox(height: 24),
                    const SectionTitle('Active chats'),
                    _ActiveChips(active: active, onOpen: (c) { if (self != null) _open(context, c, self); }),
                  ],

                  // ---- recent clients (name cards, not a scroller) ----
                  if (recent.isNotEmpty) ...[
                    const SizedBox(height: 24),
                    SectionTitle('Recent clients',
                        action: recent.length > 4 ? 'View all' : null, onAction: () => _tab(ref, 1)),
                    for (final r in recent.take(4))
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _RecentClientCard(row: r, self: self,
                            onOpen: self == null ? null : () => _open(context, r.c, self)),
                      ),
                  ],

                  // ---- celestial milestones (fills the reserved space, real data) ----
                  const SizedBox(height: 24),
                  _journeyCard(self, repeatClients),

                  // ---- new consultation requests (moved to the bottom) ----
                  const SizedBox(height: 24),
                  SectionTitle('New consultation requests${pending.isEmpty ? '' : ' · ${pending.length}'}'),
                  if (pending.isEmpty)
                    _emptyRequests(online)
                  else
                    for (final r in pending)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _RequestCard(row: r, onOpen: self == null ? null : () => _open(context, r.c, self)),
                      ),

                  // ---- latest announcement from Asktro ----
                  if (notifs.isNotEmpty) ...[
                    const SizedBox(height: 24),
                    const SectionTitle('From Asktro'),
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

  // ============================ HEADER ============================
  Widget _header(
    BuildContext context,
    WidgetRef ref,
    Astrologer? self,
    String? uid,
    bool online,
    int unread, {
    required double rating,
    required int reviews,
    required int waiting,
    required int todayEarn,
    required int yesterdayEarn,
    required double goalPct,
  }) {
    final topPad = MediaQuery.of(context).padding.top;
    final name = (self?.name ?? 'Astrologer').split(' ').first;

    // today vs yesterday delta
    String? delta;
    Color? deltaColor;
    IconData? deltaIcon;
    if (yesterdayEarn > 0) {
      final pct = ((todayEarn - yesterdayEarn) / yesterdayEarn * 100).round();
      delta = '${pct.abs()}% vs yest.';
      deltaColor = pct >= 0 ? _cGreen : const Color(0xFFFFB0A6);
      deltaIcon = pct >= 0 ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded;
    }

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(
        gradient: Sky.heroGrad,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(32)),
      ),
      child: Stack(
        children: [
          const Positioned.fill(child: CelestialWash(opacity: 0.9)),
          Padding(
            padding: EdgeInsets.fromLTRB(18, topPad + 14, 18, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // -- identity row --
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(2.5),
                      decoration: const BoxDecoration(shape: BoxShape.circle, gradient: Sky.goldGrad),
                      child: AppAvatar(name: self?.name ?? 'You', photoUrl: self?.profilePhoto, size: 54),
                    ),
                    const SizedBox(width: 13),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Namaste,', style: Sky.label.copyWith(fontSize: 12.5, color: Colors.white70)),
                          Row(
                            children: [
                              Flexible(
                                child: Text(name,
                                    style: Sky.h1.copyWith(fontSize: 26, color: Colors.white),
                                    overflow: TextOverflow.ellipsis),
                              ),
                              if (self?.verified ?? false) ...[
                                const SizedBox(width: 6),
                                const Icon(Icons.verified_rounded, size: 18, color: _cGold),
                              ],
                            ],
                          ),
                          const SizedBox(height: 7),
                          _titleChips(self),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    // -- bell + online toggle, in-line and top-aligned --
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            _bell(ref, unread),
                            const SizedBox(width: 10),
                            OnlineToggle(
                              value: online,
                              onChanged: uid == null ? null : (v) => ref.read(astrologerRepositoryProvider).setOnline(uid, v),
                            ),
                          ],
                        ),
                        const SizedBox(height: 7),
                        Text(online ? 'Visible to clients' : 'You are offline',
                            style: Sky.label.copyWith(
                                fontSize: 10, color: online ? _cGreen : Colors.white54, fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ],
                ),

                const SizedBox(height: 16),
                Divider(color: Colors.white.withValues(alpha: 0.14), height: 1),
                const SizedBox(height: 16),

                // -- vitals strip (4 columns incl. the goal + its progress bar) --
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _vital(
                        icon: Icons.star_rounded,
                        color: _cGold,
                        value: rating.toStringAsFixed(1),
                        label: reviews > 0 ? '$reviews reviews' : 'Your rating',
                      ),
                    ),
                    _vDivider(),
                    Expanded(
                      child: _vital(
                        icon: Icons.forum_rounded,
                        color: _cBlue,
                        value: '$waiting',
                        label: 'Waiting now',
                      ),
                    ),
                    _vDivider(),
                    Expanded(
                      child: _vital(
                        icon: Icons.account_balance_wallet_rounded,
                        color: _cGreen,
                        value: Money.formatPaise(todayEarn),
                        label: 'Today',
                        deltaIcon: deltaIcon,
                        delta: delta,
                        deltaColor: deltaColor,
                      ),
                    ),
                    _vDivider(),
                    Expanded(
                      child: _vital(
                        icon: Icons.flag_rounded,
                        color: _cGold,
                        value: '${(goalPct * 100).round()}%',
                        label: 'Today’s goal',
                        progress: goalPct,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _titleChips(Astrologer? self) {
    final label = (self?.risingStar ?? false) ? 'Rising Star Astrologer' : 'Asktro Astrologer';
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
          decoration: BoxDecoration(gradient: Sky.goldGrad, borderRadius: BorderRadius.circular(999)),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.auto_awesome_rounded, size: 11, color: Sky.purpleDeep),
              const SizedBox(width: 4),
              Text(label,
                  style: Sky.label.copyWith(fontSize: 10.5, color: Sky.purpleDeep, fontWeight: FontWeight.w800)),
            ],
          ),
        ),
        if ((self?.followers ?? 0) > 0)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text('${self?.followers} followers',
                style: Sky.label.copyWith(fontSize: 10.5, color: Colors.white, fontWeight: FontWeight.w700)),
          ),
      ],
    );
  }

  Widget _bell(WidgetRef ref, int unread) {
    return GestureDetector(
      onTap: () => _tab(ref, 3),
      behavior: HitTestBehavior.opaque,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(13),
            ),
            child: const Icon(Icons.notifications_rounded, color: Colors.white, size: 20),
          ),
          if (unread > 0)
            Positioned(
              right: -3,
              top: -3,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                constraints: const BoxConstraints(minWidth: 17),
                decoration: BoxDecoration(gradient: Sky.goldGrad, borderRadius: BorderRadius.circular(999)),
                child: Text('${unread > 9 ? '9+' : unread}',
                    textAlign: TextAlign.center,
                    style: Sky.label.copyWith(fontSize: 9.5, color: Sky.purpleDeep, fontWeight: FontWeight.w800)),
              ),
            ),
        ],
      ),
    );
  }

  Widget _vDivider() => Container(
      width: 1, height: 44, margin: const EdgeInsets.symmetric(horizontal: 7), color: Colors.white.withValues(alpha: 0.12));

  Widget _vital({
    required IconData icon,
    required Color color,
    required String value,
    required String label,
    IconData? deltaIcon,
    String? delta,
    Color? deltaColor,
    double? progress,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.22), borderRadius: BorderRadius.circular(9)),
          child: Icon(icon, size: 16, color: color),
        ),
        const SizedBox(height: 8),
        Text(value,
            style: Sky.h1.copyWith(fontSize: 17, color: Colors.white), maxLines: 1, overflow: TextOverflow.ellipsis),
        const SizedBox(height: 2),
        Text(label, style: Sky.label.copyWith(fontSize: 9.5, color: Colors.white70), maxLines: 1, overflow: TextOverflow.ellipsis),
        if (delta != null) ...[
          const SizedBox(height: 3),
          Row(
            children: [
              Icon(deltaIcon, size: 10, color: deltaColor),
              const SizedBox(width: 2),
              Flexible(
                child: Text(delta,
                    style: Sky.label.copyWith(fontSize: 9, color: deltaColor, fontWeight: FontWeight.w700),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
            ],
          ),
        ],
        if (progress != null) ...[
          const SizedBox(height: 7),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 5,
              backgroundColor: Colors.white.withValues(alpha: 0.18),
              valueColor: const AlwaysStoppedAnimation(_cGold),
            ),
          ),
        ],
      ],
    );
  }

  // ============================ QUICK ACTIONS ============================
  Widget _quickActions(BuildContext context, WidgetRef ref) {
    final items = <(IconData, String, Color, VoidCallback)>[
      (Icons.people_alt_rounded, 'My clients', Sky.purple, () => _tab(ref, 1)),
      (Icons.payments_rounded, 'Payouts', Sky.green, () => _tab(ref, 2)),
      (Icons.star_rounded, 'Reviews', Sky.amber,
          () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ReviewsScreen()))),
      (Icons.trending_up_rounded, 'Earnings', Sky.gold, () => _tab(ref, 2)),
      (Icons.event_available_rounded, 'Availability', Sky.purpleDeep, () => _availabilitySheet(context, ref)),
      (Icons.headset_mic_rounded, 'Support', Sky.red, () => _tab(ref, 4)),
    ];
    return GridView.count(
      crossAxisCount: 3,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.02,
      children: [for (final it in items) _qaTile(it.$1, it.$2, it.$3, it.$4)],
    );
  }

  Widget _qaTile(IconData icon, String label, Color accent, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [accent.withValues(alpha: 0.14), accent.withValues(alpha: 0.05)],
          ),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: accent.withValues(alpha: 0.22)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(13),
                  boxShadow: [BoxShadow(color: accent.withValues(alpha: 0.35), blurRadius: 12, offset: const Offset(0, 5))]),
              child: Icon(icon, color: Colors.white, size: 21),
            ),
            const SizedBox(height: 9),
            Text(label, style: Sky.label.copyWith(fontSize: 11.5, color: Sky.ink, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }

  // ============================ EARNINGS ============================
  Widget _earnings(WidgetRef ref, List<double> pts, int todayEarn, int yesterdayEarn, int weekTotal) {
    final range = ref.watch(earningsRangeProvider);
    final headline = range == 0 ? todayEarn : (range == 1 ? yesterdayEarn : weekTotal);
    final hasData = pts.any((p) => p > 0);
    final best = pts.fold<double>(0, (a, b) => b > a ? b : a).round();
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Sky.card,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Sky.line),
        boxShadow: Sky.soft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _rangeChip(ref, 0, 'Today', range),
              const SizedBox(width: 6),
              _rangeChip(ref, 1, 'Yesterday', range),
              const SizedBox(width: 6),
              _rangeChip(ref, 2, 'This week', range),
            ],
          ),
          const SizedBox(height: 14),
          Text(Money.formatPaise(headline), style: Sky.figure.copyWith(fontSize: 30, color: Sky.purpleDeep)),
          const SizedBox(height: 2),
          Text(range == 0 ? 'Today · net after commission' : (range == 1 ? 'Yesterday · net' : 'This week · net'),
              style: Sky.label.copyWith(fontSize: 11.5)),
          const SizedBox(height: 16),
          // plot area on a soft lavender panel
          Container(
            padding: const EdgeInsets.fromLTRB(8, 14, 8, 8),
            decoration: BoxDecoration(color: Sky.surface, borderRadius: BorderRadius.circular(16)),
            child: Column(
              children: [
                Sparkline(
                  points: hasData ? pts : const [1, 2.4, 1.8, 3.2, 2.6, 4, 3.4],
                  color: Sky.purple,
                  height: 72,
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    for (final d in _last7DayLabels())
                      Text(d, style: Sky.label.copyWith(fontSize: 9.5, color: Sky.ink3)),
                  ],
                ),
              ],
            ),
          ),
          if (hasData) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.emoji_events_rounded, size: 14, color: Sky.gold),
                const SizedBox(width: 6),
                Text('Best day this week: ${Money.formatPaise(best)}',
                    style: Sky.label.copyWith(fontSize: 11.5, fontWeight: FontWeight.w700)),
              ],
            ),
          ],
        ],
      ),
    );
  }

  // Weekday initials for the trailing 7 days, so the last tick is today.
  List<String> _last7DayLabels() {
    const wd = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    final now = DateTime.now();
    return [for (var i = 6; i >= 0; i--) wd[(now.subtract(Duration(days: i)).weekday - 1) % 7]];
  }

  Widget _rangeChip(WidgetRef ref, int value, String label, int selected) {
    final on = value == selected;
    return GestureDetector(
      onTap: () => ref.read(earningsRangeProvider.notifier).state = value,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: on ? Sky.purple : Sky.surface,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(label,
            style: Sky.label.copyWith(
                fontSize: 11, color: on ? Colors.white : Sky.ink2, fontWeight: FontWeight.w700)),
      ),
    );
  }

  // ============================ METRIC STRIP ============================
  Widget _statScroller(int todaySessions, Astrologer? self, int repeatClients, String acceptance) {
    final cards = <Widget>[
      _statCard('$todaySessions', "Today's sessions", Icons.event_available_rounded, Sky.purple),
      _statCard('${(self?.rating ?? 0).toStringAsFixed(1)}★', 'Your rating', Icons.star_rounded, Sky.gold),
      _statCard(_resp(self?.responseTimeSec ?? 0), 'Avg response', Icons.bolt_rounded, Sky.green),
      _statCard('${self?.totalConsultations ?? 0}', 'Total sessions', Icons.forum_rounded, Sky.purpleDeep),
      _statCard('$repeatClients', 'Repeat clients', Icons.autorenew_rounded, Sky.amber),
      _statCard(acceptance, 'Acceptance', Icons.verified_user_rounded, Sky.green),
    ];
    return SizedBox(
      height: 122,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: EdgeInsets.zero,
        itemCount: cards.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) => cards[i],
      ),
    );
  }

  Widget _statCard(String value, String label, IconData icon, Color accent) {
    return Container(
      width: 134,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Colors.white, Color(0xFFFFFCF4)],
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFEAD79A).withValues(alpha: 0.5)),
        boxShadow: Sky.soft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(color: accent.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, size: 19, color: accent),
          ),
          const SizedBox(height: 12),
          Text(value, style: Sky.figure.copyWith(fontSize: 22), maxLines: 1, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 2),
          Text(label, style: Sky.label.copyWith(fontSize: 11.5), maxLines: 1, overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }

  // ============================ MILESTONES (filler) ============================
  Widget _journeyCard(Astrologer? self, int repeatClients) {
    final chips = <(IconData, String, String)>[
      (Icons.forum_rounded, '${self?.totalConsultations ?? 0}', 'Sessions'),
      (Icons.favorite_rounded, '${self?.followers ?? 0}', 'Followers'),
      (Icons.autorenew_rounded, '$repeatClients', 'Repeat'),
      (Icons.star_rounded, (self?.rating ?? 0).toStringAsFixed(1), 'Rating'),
    ];
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        gradient: Sky.heroGrad,
        borderRadius: BorderRadius.circular(22),
        boxShadow: Sky.soft,
      ),
      child: Stack(
        children: [
          const Positioned.fill(child: CelestialWash(opacity: 0.7)),
          Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.auto_awesome_rounded, size: 16, color: _cGold),
                    const SizedBox(width: 7),
                    Text('Your journey', style: Sky.h2.copyWith(fontSize: 15, color: Colors.white)),
                  ],
                ),
                const SizedBox(height: 4),
                Text('Every consultation adds to your constellation. Keep shining. ✦',
                    style: Sky.label.copyWith(fontSize: 11.5, color: Colors.white70)),
                const SizedBox(height: 16),
                Row(
                  children: [
                    for (var i = 0; i < chips.length; i++) ...[
                      if (i > 0) _vDivider(),
                      Expanded(
                        child: Column(
                          children: [
                            Icon(chips[i].$1, size: 15, color: _cGold),
                            const SizedBox(height: 6),
                            Text(chips[i].$2, style: Sky.h1.copyWith(fontSize: 17, color: Colors.white)),
                            const SizedBox(height: 2),
                            Text(chips[i].$3, style: Sky.label.copyWith(fontSize: 9.5, color: Colors.white60)),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _announcement(Map<String, dynamic> n) {
    final body = (n['body'] ?? '').toString();
    return SkyCard(
      padding: const EdgeInsets.all(13),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(gradient: Sky.goldGrad, borderRadius: BorderRadius.circular(12)),
            child: const Icon(Icons.campaign_rounded, color: Sky.purpleDeep, size: 20),
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

/// A waiting consultation request with an Accept affordance.
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
      height: 84,
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
        width: 58,
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
                    width: 14,
                    height: 14,
                    decoration: BoxDecoration(
                      color: paused ? Sky.amber : Sky.green,
                      shape: BoxShape.circle,
                      border: Border.all(color: Sky.bg, width: 2.5),
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

/// A finished session rendered as a name card, with the net earning and a chat
/// affordance that reopens the (read-only) session.
class _RecentClientCard extends ConsumerWidget {
  const _RecentClientCard({required this.row, required this.self, required this.onOpen});
  final SessionRow row;
  final Astrologer? self;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = row.c;
    final cust = ref.watch(customerProvider(c.customerId)).valueOrNull;
    final earned = self?.netOf(c.totalCharged) ?? c.totalCharged;
    final label = '${c.type.name[0].toUpperCase()}${c.type.name.substring(1)} consultation';
    return SkyCard(
      onTap: onOpen,
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          AppAvatar(name: cust?.name ?? 'Customer', photoUrl: cust?.profilePhoto, size: 42),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(cust?.name ?? 'Customer',
                    style: Sky.h2.copyWith(fontSize: 14), maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text('$label · ${Money.formatDuration(c.billedSeconds)}',
                    style: Sky.label.copyWith(fontSize: 11.5), maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(Money.formatPaise(earned), style: Sky.h2.copyWith(fontSize: 13.5, color: Sky.green)),
              const SizedBox(height: 4),
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(color: Sky.purple.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(9)),
                child: const Icon(Icons.chat_bubble_outline_rounded, size: 15, color: Sky.purple),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
