import 'package:flutter/material.dart';
import 'package:shared_flutter/shared_flutter.dart';

import 'celestial.dart';
import 'customer_insight.dart';

/// The customer's complete details for the astrologer — shown on the incoming
/// request screen and pinned as the first card in the chat. Includes a WIRED
/// Kundli / birth-chart section: it renders the real Sun sign now and is ready
/// to show the full chart the moment the chart/ephemeris API is connected (drop
/// the chart widget into [_chartPlaceholder]).
class CustomerDetailsCard extends StatelessWidget {
  const CustomerDetailsCard({super.key, required this.profile});
  final UserProfile? profile;

  @override
  Widget build(BuildContext context) {
    final i = CustomerInsight(profile);
    final name = profile?.name ?? 'Customer';
    final subtitle = [
      if (i.age != null) '${i.age} yrs',
      if (i.genderLabel != '—') i.genderLabel,
      if (i.relationshipLabel != '—') i.relationshipLabel,
    ].join('  ·  ');

    return SkyCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            AppAvatar(name: name, photoUrl: profile?.profilePhoto, size: 46),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: Sky.h2.copyWith(fontSize: 16), maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (subtitle.isNotEmpty)
                    Text(subtitle, style: Sky.label.copyWith(fontSize: 12, color: Sky.ink2)),
                ],
              ),
            ),
          ]),
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
    );
  }

  // Wired placeholder — swap the inner content for the real chart widget once
  // the kundli API is available. The layout/section already lives in the flow.
  Widget _chartPlaceholder() => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Sky.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Sky.line),
        ),
        child: Column(
          children: [
            const Icon(Icons.auto_awesome_rounded, color: Sky.gold, size: 24),
            const SizedBox(height: 6),
            Text('Full birth chart',
                style: Sky.label.copyWith(fontWeight: FontWeight.w800, color: Sky.ink)),
            const SizedBox(height: 2),
            Text('The kundli will render here once the chart service is connected.',
                textAlign: TextAlign.center, style: Sky.label.copyWith(fontSize: 11, color: Sky.ink3)),
          ],
        ),
      );

  Widget _section(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(t.toUpperCase(),
            style: Sky.label
                .copyWith(fontSize: 10.5, letterSpacing: 1, color: Sky.gold, fontWeight: FontWeight.w800)),
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
