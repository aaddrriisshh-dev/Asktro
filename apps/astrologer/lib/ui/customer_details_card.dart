import 'package:flutter/material.dart';
import 'package:shared_flutter/shared_flutter.dart';

import 'celestial.dart';
import 'customer_insight.dart';

/// The customer's complete details for the astrologer — shown on the incoming
/// request screen and pinned as the first card in the chat. Collapsible so it
/// doesn't eat the chat viewport: a compact identity header by default, tap to
/// expand the full birth details + Kundli. Includes a WIRED birth-chart section
/// (real Sun sign now; drop the chart widget into [_chartPlaceholder] once the
/// chart/ephemeris API is connected).
class CustomerDetailsCard extends StatefulWidget {
  const CustomerDetailsCard({super.key, required this.profile, this.initiallyExpanded = false});
  final UserProfile? profile;
  final bool initiallyExpanded;

  @override
  State<CustomerDetailsCard> createState() => _CustomerDetailsCardState();
}

class _CustomerDetailsCardState extends State<CustomerDetailsCard> {
  late bool _expanded = widget.initiallyExpanded;

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
      decoration: BoxDecoration(
        gradient: Sky.lavGrad,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Sky.line),
        boxShadow: Sky.soft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
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
                        if (!_expanded) ...[
                          const SizedBox(height: 3),
                          Row(
                            children: [
                              const Icon(Icons.auto_awesome_rounded, size: 11, color: Sky.gold),
                              const SizedBox(width: 4),
                              Text('Birth details & kundli · tap to view',
                                  style: Sky.label.copyWith(fontSize: 10.5, color: Sky.purple, fontWeight: FontWeight.w700),),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(color: Sky.purple.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(9)),
                    child: Icon(_expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                        size: 20, color: Sky.purple,),
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
                  _chartPlaceholder(),
                ],
              ),
            ),
        ],
      ),
    );
  }

  // Wired placeholder — swap the inner content for the real chart widget once
  // the kundli API is available. The layout/section already lives in the flow.
  Widget _chartPlaceholder() => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Sky.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Sky.line),
        ),
        child: Column(
          children: [
            const Icon(Icons.auto_awesome_rounded, color: Sky.gold, size: 24),
            const SizedBox(height: 6),
            Text('Full birth chart',
                style: Sky.label.copyWith(fontWeight: FontWeight.w800, color: Sky.ink),),
            const SizedBox(height: 2),
            Text('The kundli will render here once the chart service is connected.',
                textAlign: TextAlign.center, style: Sky.label.copyWith(fontSize: 11, color: Sky.ink3),),
          ],
        ),
      );

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
