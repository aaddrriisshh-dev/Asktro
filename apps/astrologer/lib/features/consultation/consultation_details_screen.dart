import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../ui/celestial.dart';
import '../../ui/customer_insight.dart';
import 'consultations_tab.dart' show relTime;
import 'history_chat_view.dart';

// Derived from the already-loaded session list (no extra Firestore query, so no
// composite index needed) — every prior session with this customer.
final _historyProvider = Provider.autoDispose.family<List<Consultation>, String>((ref, customerId) {
  final rows = ref.watch(sessionRowsProvider).valueOrNull ?? const [];
  return rows.where((r) => r.c.customerId == customerId).map((r) => r.c).toList();
});

final _noteProvider = StreamProvider.autoDispose.family<String, String>((ref, customerId) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref.watch(astrologerRepositoryProvider).watchPrivateNote(uid, customerId);
});

/// The astrologer's read of a customer: who they are, their chart summary, the
/// history between them, and private notes only the astrologer can see.
class ConsultationDetailsScreen extends ConsumerStatefulWidget {
  const ConsultationDetailsScreen({super.key, required this.consultation, required this.self});
  final Consultation consultation;
  final Astrologer self;

  @override
  ConsumerState<ConsultationDetailsScreen> createState() => _ConsultationDetailsScreenState();
}

class _ConsultationDetailsScreenState extends ConsumerState<ConsultationDetailsScreen> {
  final _note = TextEditingController();
  bool _noteLoaded = false;
  bool _noteDirty = false;
  bool _saving = false;

  String get _customerId => widget.consultation.customerId;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _saveNote() async {
    setState(() => _saving = true);
    await ref.read(astrologerRepositoryProvider).savePrivateNote(widget.self.id, _customerId, _note.text.trim());
    if (!mounted) return;
    setState(() {
      _saving = false;
      _noteDirty = false;
    });
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Note saved')));
  }

  @override
  Widget build(BuildContext context) {
    final cust = ref.watch(customerProvider(_customerId)).valueOrNull;
    final insight = CustomerInsight(cust);
    final history = ref.watch(_historyProvider(_customerId));
    final noteAsync = ref.watch(_noteProvider(_customerId));
    // Seed the editor once from the server value.
    noteAsync.whenData((v) {
      if (!_noteLoaded) {
        _note.text = v;
        _noteLoaded = true;
      }
    });
    final past = history.where((c) => c.id != widget.consultation.id).toList();
    final repeat = past.isNotEmpty;

    return SkyScaffold(
      child: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(child: _header(context, cust, insight, repeat, past.length)),
          SliverPadding(
            padding: EdgeInsets.fromLTRB(16, 4, 16, 40 + MediaQuery.of(context).padding.bottom),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                _customerInfo(insight, cust),
                const SizedBox(height: 14),
                _birthDetails(insight),
                const SizedBox(height: 14),
                _kundli(context, insight),
                const SizedBox(height: 14),
                _timeline(context, past),
                const SizedBox(height: 14),
                _notes(),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  Widget _header(BuildContext context, UserProfile? cust, CustomerInsight insight, bool repeat, int visits) {
    final topPad = MediaQuery.of(context).padding.top;
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
            padding: EdgeInsets.fromLTRB(16, topPad + 6, 16, 22),
            child: Column(
              children: [
                Row(
                  children: [
                    _circleBtn(Icons.arrow_back_ios_new_rounded, () => Navigator.of(context).maybePop()),
                    const Spacer(),
                    if (repeat) Pill('$visits ${visits == 1 ? 'visit' : 'visits'}', color: Sky.gold, filled: true),
                  ],
                ),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.all(3),
                  decoration: const BoxDecoration(shape: BoxShape.circle, gradient: Sky.goldGrad),
                  child: AppAvatar(name: cust?.name ?? 'Customer', photoUrl: cust?.profilePhoto, size: 76),
                ),
                const SizedBox(height: 12),
                Text(cust?.name ?? 'Customer',
                    style: Sky.h1.copyWith(color: Colors.white, fontSize: 22), textAlign: TextAlign.center),
                const SizedBox(height: 4),
                Text(
                  [
                    if (insight.age != null) '${insight.age} yrs',
                    if (insight.genderLabel != '—') insight.genderLabel,
                    if (insight.birthPlace != 'Not provided') insight.birthPlace,
                  ].join('  ·  '),
                  style: Sky.label.copyWith(color: Colors.white.withValues(alpha: 0.85), fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _circleBtn(IconData icon, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), shape: BoxShape.circle),
          child: Icon(icon, color: Colors.white, size: 17),
        ),
      );

  Widget _sectionCard({required String title, IconData? icon, required Widget child, Widget? trailing}) {
    return SkyCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (icon != null) ...[Icon(icon, size: 17, color: Sky.gold), const SizedBox(width: 7)],
              Text(title, style: Sky.h2.copyWith(fontSize: 15)),
              const Spacer(),
              if (trailing != null) trailing,
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }

  Widget _kv(String k, String v, {bool strong = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(width: 108, child: Text(k, style: Sky.label.copyWith(fontSize: 12.5))),
            Expanded(
              child: Text(v,
                  style: Sky.body.copyWith(
                      fontSize: 13.5, fontWeight: strong ? FontWeight.w700 : FontWeight.w600,
                      color: v.contains('provided') || v.contains('unknown') || v == '—' ? Sky.ink3 : Sky.ink)),
            ),
          ],
        ),
      );

  Widget _customerInfo(CustomerInsight insight, UserProfile? cust) {
    final langs = cust?.languages ?? const <String>[];
    return _sectionCard(
      title: 'Customer information',
      icon: Icons.person_rounded,
      child: Column(
        children: [
          _kv('Name', cust?.name ?? '—', strong: true),
          _kv('Age', insight.age == null ? '—' : '${insight.age} years'),
          _kv('Gender', insight.genderLabel),
          _kv('Relationship', insight.relationshipLabel),
          _kv('Languages', langs.isEmpty ? '—' : langs.join(', ')),
        ],
      ),
    );
  }

  Widget _birthDetails(CustomerInsight insight) {
    return _sectionCard(
      title: 'Birth details',
      icon: Icons.cake_rounded,
      child: Column(
        children: [
          _kv('Date of birth', insight.birthDate, strong: true),
          _kv('Time of birth', insight.birthTime),
          _kv('Place of birth', insight.birthPlace),
        ],
      ),
    );
  }

  Widget _kundli(BuildContext context, CustomerInsight insight) {
    // Sun sign is computed for real; the deeper chart values need an ephemeris
    // engine and are shown as a clearly-pending state (never faked).
    Widget chip(String k, String v) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(color: Sky.surface, borderRadius: BorderRadius.circular(13)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(k, style: Sky.label.copyWith(fontSize: 11)),
              const SizedBox(height: 3),
              Text(v, style: Sky.h2.copyWith(fontSize: 14, color: v == '—' ? Sky.ink3 : Sky.ink)),
            ],
          ),
        );
    return _sectionCard(
      title: 'Kundli summary',
      icon: Icons.auto_awesome_rounded,
      trailing: const Pill('Sun sign live', color: Sky.green),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 2.5,
            children: [
              chip('Sun sign', insight.sunSign),
              chip('Moon sign', '—'),
              chip('Ascendant', '—'),
              chip('Mahadasha', '—'),
              chip('Antardasha', '—'),
              chip('Current transit', '—'),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            insight.hasBirthTime
                ? 'Full chart (Moon, Ascendant, Dashas, yogas & doshas) computes from the birth time.'
                : 'Add the birth time to compute the full chart.',
            style: Sky.label.copyWith(fontSize: 11.5),
          ),
          const SizedBox(height: 12),
          GhostButton(
            label: 'View complete kundli',
            icon: Icons.open_in_full_rounded,
            onPressed: () => _comingSoon(context, 'Complete Kundli'),
          ),
        ],
      ),
    );
  }

  Widget _timeline(BuildContext context, List<Consultation> past) {
    return _sectionCard(
      title: 'Previous consultations',
      icon: Icons.history_rounded,
      child: past.isEmpty
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text('First consultation with this customer.', style: Sky.label.copyWith(fontSize: 12.5)),
            )
          : Column(
              children: [
                for (var i = 0; i < past.length; i++)
                  _TimelineItem(
                    consultation: past[i],
                    last: i == past.length - 1,
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => HistoryChatView(consultationId: past[i].id, self: widget.self),
                    )),
                  ),
              ],
            ),
    );
  }

  Widget _notes() {
    return _sectionCard(
      title: 'Private notes',
      icon: Icons.lock_rounded,
      trailing: Text('Only you', style: Sky.label.copyWith(fontSize: 11, color: Sky.ink3)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          TextField(
            controller: _note,
            minLines: 3,
            maxLines: 8,
            style: Sky.body.copyWith(fontSize: 14),
            onChanged: (_) {
              if (!_noteDirty) setState(() => _noteDirty = true);
            },
            decoration: InputDecoration(
              hintText: 'e.g. Very anxious about career. Father unwell. Asked about marriage last time.',
              hintStyle: Sky.label.copyWith(fontSize: 13, color: Sky.ink3),
              filled: true,
              fillColor: Sky.surface,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
              contentPadding: const EdgeInsets.all(14),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: 140,
            child: AnimatedOpacity(
              opacity: _noteDirty ? 1 : 0.5,
              duration: const Duration(milliseconds: 150),
              child: GoldButton(
                label: 'Save note',
                loading: _saving,
                onPressed: _noteDirty && !_saving ? _saveNote : null,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _comingSoon(BuildContext context, String title) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Sky.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(26))),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 22, 24, 34),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: const BoxDecoration(gradient: Sky.goldGrad, shape: BoxShape.circle),
              child: const Icon(Icons.auto_awesome_rounded, color: Sky.purpleDeep, size: 26),
            ),
            const SizedBox(height: 14),
            Text(title, style: Sky.h1.copyWith(fontSize: 19)),
            const SizedBox(height: 6),
            Text('The full chart engine is being wired up. The Sun sign above is already computed from the birth date.',
                style: Sky.label.copyWith(fontSize: 13), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

class _TimelineItem extends StatelessWidget {
  const _TimelineItem({required this.consultation, required this.last, required this.onTap});
  final Consultation consultation;
  final bool last;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = consultation;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Column(
              children: [
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: Sky.card,
                    shape: BoxShape.circle,
                    border: Border.all(color: Sky.gold, width: 2.5),
                  ),
                ),
                if (!last) Expanded(child: Container(width: 2, color: Sky.line)),
              ],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(bottom: last ? 0 : 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text('${c.type.name[0].toUpperCase()}${c.type.name.substring(1)} consultation',
                              style: Sky.h2.copyWith(fontSize: 14)),
                        ),
                        const Icon(Icons.chevron_right_rounded, size: 18, color: Sky.ink3),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        if (c.duration > 0) Money.formatDurationLong(c.duration),
                        c.status.name,
                      ].join(' · '),
                      style: Sky.label.copyWith(fontSize: 12),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
