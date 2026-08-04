import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:shared_flutter/shared_flutter.dart';

import 'celestial.dart';
import 'customer_insight.dart';
import '../data/customer_kundli_service.dart';

/// The customer's complete details for the astrologer — shown on the incoming
/// request screen and pinned as the first card in the chat. Collapsible so it
/// doesn't eat the chat viewport: a compact identity header by default, tap to
/// expand the full birth details + Kundli. Includes a WIRED birth-chart section
/// (real Sun sign now; drop the chart widget into [_chartPlaceholder] once the
/// chart/ephemeris API is connected).
class CustomerDetailsCard extends StatefulWidget {
  const CustomerDetailsCard({super.key, required this.profile, this.initiallyExpanded = false, this.requestedSkill});
  final UserProfile? profile;
  final bool initiallyExpanded;

  /// When the customer entered via a skill tile ('palmistry'|'numerology'|'tarot'),
  /// a slim banner pinned at the TOP of this card tells the astrologer what
  /// reading they came for. Null → no banner (a normal session).
  final String? requestedSkill;

  @override
  State<CustomerDetailsCard> createState() => _CustomerDetailsCardState();
}

class _CustomerDetailsCardState extends State<CustomerDetailsCard> {
  late bool _expanded = widget.initiallyExpanded;
  final _kundli = CustomerKundliService(FirebaseFunctions.instanceFor(region: 'asia-south1'));
  Future<String?>? _chartFuture; // lazily started the first time the card expands

  void _ensureChartStarted() {
    if (_chartFuture != null) return;
    final p = widget.profile;
    if (p != null) _chartFuture = _kundli.chartSvg(p);
  }

  @override
  Widget build(BuildContext context) {
    final profile = widget.profile;
    final i = CustomerInsight(profile);
    final name = profile?.name ?? 'Customer';
    final subtitle = [
      if (i.age != null) '${i.age} yrs',
      if (i.genderLabel != '—') i.genderLabel,
      if (i.relationshipLabel != '—') i.relationshipLabel,
    ].join('  ·  ');

    return Container(
      clipBehavior: Clip.antiAlias, // so the skill strip respects the rounded top
      decoration: BoxDecoration(
        gradient: Sky.lavGrad,
        borderRadius: BorderRadius.circular(20),
        // A defined purple outline so the customer card reads as a distinct
        // panel and doesn't blend into the chat behind it.
        border: Border.all(color: Sky.purple.withValues(alpha: 0.38), width: 1.5),
        boxShadow: Sky.soft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ---- skill strip (only when the customer came via a skill tile) ----
          _skillStrip(),
          // ---- always-visible header (tap to expand / collapse) ----
          GestureDetector(
            onTap: () => setState(() => _expanded = !_expanded),
            behavior: HitTestBehavior.opaque,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  AppAvatar(name: name, photoUrl: profile?.profilePhoto, size: 46),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name, style: Sky.h2.copyWith(fontSize: 16), maxLines: 1, overflow: TextOverflow.ellipsis),
                        if (subtitle.isNotEmpty)
                          Text(subtitle, style: Sky.label.copyWith(fontSize: 12, color: Sky.ink2)),
                        const SizedBox(height: 3),
                        Row(
                          children: [
                            const Icon(Icons.auto_awesome_rounded, size: 11, color: Sky.gold),
                            const SizedBox(width: 4),
                            Text('Birth details & kundli',
                                style: Sky.label.copyWith(fontSize: 10.5, color: Sky.purple, fontWeight: FontWeight.w700),),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.fromLTRB(11, 6, 8, 6),
                    decoration: BoxDecoration(color: Sky.purple.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(999)),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_expanded ? 'Hide' : 'View',
                            style: Sky.label.copyWith(fontSize: 11.5, color: Sky.purple, fontWeight: FontWeight.w800),),
                        const SizedBox(width: 2),
                        Icon(_expanded ? Icons.keyboard_arrow_up_rounded : Icons.keyboard_arrow_down_rounded,
                            size: 18, color: Sky.purple,),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          // ---- expandable body ----
          if (_expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Divider(color: Sky.line, height: 1),
                  const SizedBox(height: 14),
                  _section('Birth details'),
                  _row('Date of birth', i.birthDate),
                  _row('Time of birth', i.birthTime),
                  _row('Place of birth', i.birthPlace),
                  if ((profile?.languages ?? const <String>[]).isNotEmpty)
                    _row('Languages', profile!.languages.join(', ')),
                  const SizedBox(height: 14),
                  _section('Birth chart · Kundli'),
                  _row('Sun sign', i.sunSign),
                  const SizedBox(height: 8),
                  _chartSection(),
                ],
              ),
            ),
        ],
      ),
    );
  }

  // The customer's live ProKerala birth chart, fetched on first expand and
  // rendered as an SVG. Falls back to a friendly note if it can't be produced
  // (e.g. no birth place on file).
  Widget _chartSection() {
    _ensureChartStarted();
    return FutureBuilder<String?>(
      future: _chartFuture,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return _chartBox(child: const Padding(
            padding: EdgeInsets.symmetric(vertical: 22),
            child: Center(child: CircularProgressIndicator(color: Sky.purple, strokeWidth: 2.4)),
          ),);
        }
        final svg = snap.data;
        if (svg == null || svg.isEmpty) return _chartFallback();
        return _chartBox(
          child: AspectRatio(
            aspectRatio: 1,
            child: SvgPicture.string(svg, fit: BoxFit.contain),
          ),
        );
      },
    );
  }

  Widget _chartBox({required Widget child}) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          // Warm parchment tint (not plain white) so the chart reads like an
          // almanac page and matches the customer app's kundli.
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFFCF6E7), Color(0xFFF7EFD8)],
          ),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFFFE29A)),
        ),
        child: child,
      );

  Widget _chartFallback() => _chartBox(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              const Icon(Icons.auto_awesome_rounded, color: Sky.gold, size: 24),
              const SizedBox(height: 6),
              Text('Chart unavailable',
                  style: Sky.label.copyWith(fontWeight: FontWeight.w800, color: Sky.ink),),
              const SizedBox(height: 2),
              Text('The customer has no birth place on file, or the chart service is momentarily unreachable.',
                  textAlign: TextAlign.center, style: Sky.label.copyWith(fontSize: 11, color: Sky.ink3),),
            ],
          ),
        ),
      );

  /// The skill banner pinned at the top of the card (empty when no skill).
  Widget _skillStrip() {
    final skill = widget.requestedSkill;
    if (skill == null) return const SizedBox.shrink();
    late final String label, hint;
    late final IconData icon;
    if (skill == 'palmistry') {
      label = 'Palmistry reading';
      hint = 'Ask for a clear photo of their right (dominant) hand.';
      icon = Icons.back_hand_rounded;
    } else if (skill == 'numerology') {
      label = 'Numerology reading';
      hint = 'Read from their name + date of birth below.';
      icon = Icons.calculate_rounded;
    } else if (skill == 'tarot') {
      label = 'Tarot reading';
      hint = 'Ask their question, then draw the cards.';
      icon = Icons.style_rounded;
    } else {
      label = 'Reading requested';
      hint = '';
      icon = Icons.auto_awesome_rounded;
    }
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(13, 10, 13, 10),
      decoration: BoxDecoration(
        color: Sky.purple.withValues(alpha: 0.13),
        border: Border(bottom: BorderSide(color: Sky.purple.withValues(alpha: 0.20))),
      ),
      child: Row(
        children: [
          Icon(icon, size: 17, color: Sky.purple),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Came for a $label',
                    style: Sky.label.copyWith(fontSize: 12.5, fontWeight: FontWeight.w800, color: Sky.purple)),
                if (hint.isNotEmpty) ...[
                  const SizedBox(height: 1),
                  Text(hint, style: Sky.label.copyWith(fontSize: 10.5, color: Sky.ink3)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _section(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(t.toUpperCase(),
            style: Sky.label
                .copyWith(fontSize: 10.5, letterSpacing: 1, color: Sky.gold, fontWeight: FontWeight.w800),),
      );

  Widget _row(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(width: 112, child: Text(k, style: Sky.label.copyWith(fontSize: 12.5, color: Sky.ink2))),
            Expanded(child: Text(v, style: Sky.body.copyWith(fontSize: 13.5))),
          ],
        ),
      );
}
