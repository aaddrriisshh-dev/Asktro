import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../profile_setup/onboarding_style.dart';

/// One "trust" row (icon + heading + line) shown in the home trust band.
class TrustItem {
  const TrustItem({required this.icon, required this.title, required this.subtitle});
  final String icon;
  final String title;
  final String subtitle;

  factory TrustItem.fromMap(Map<String, dynamic> m) => TrustItem(
        icon: (m['icon'] ?? '') as String,
        title: (m['title'] ?? '') as String,
        subtitle: (m['subtitle'] ?? '') as String,
      );
}

/// The whole "Why people trust Asktro" band — a portal-managed home section
/// (`homeSections/trust`). Everything here — the heading, the three assurance
/// rows and the footer line — is editable from the admin portal and reflected
/// live in the app with no rebuild.
class TrustBadges {
  const TrustBadges({
    required this.active,
    required this.title,
    required this.subtitle,
    required this.footer,
    required this.items,
  });

  final bool active;
  final String title;
  final String subtitle;
  final String footer;
  final List<TrustItem> items;

  bool get isEmpty => !active || items.isEmpty;

  factory TrustBadges.fromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final m = d.data() ?? {};
    return TrustBadges(
      active: (m['active'] ?? false) as bool,
      title: (m['title'] ?? '') as String,
      subtitle: (m['subtitle'] ?? '') as String,
      footer: (m['footer'] ?? '') as String,
      items: ((m['items'] ?? const []) as List)
          .map((e) => TrustItem.fromMap(Map<String, dynamic>.from(e as Map)))
          .toList(),
    );
  }

  static const empty = TrustBadges(active: false, title: '', subtitle: '', footer: '', items: []);
}

final homeTrustProvider = StreamProvider.autoDispose<TrustBadges>((ref) {
  final db = ref.watch(firestoreProvider);
  return db.collection('homeSections').doc('trust').snapshots().map(
        (d) => d.exists ? TrustBadges.fromDoc(d) : TrustBadges.empty,
      );
});

/// Maps a portal icon key to a celestial-appropriate glyph. Unknown keys fall
/// back to a sparkle so a mistyped key never breaks the layout.
IconData _iconFor(String key) {
  switch (key) {
    case 'genuine':
    case 'verified_products':
      return Icons.workspace_premium_rounded;
    case 'lab':
      return Icons.science_rounded;
    case 'verified':
    case 'verified_astrologer':
      return Icons.verified_rounded;
    case 'secure':
    case 'lock':
      return Icons.lock_rounded;
    case 'shield':
      return Icons.shield_rounded;
    case 'gift':
      return Icons.card_giftcard_rounded;
    case 'support':
      return Icons.support_agent_rounded;
    case 'delivery':
      return Icons.local_shipping_rounded;
    default:
      return Icons.auto_awesome_rounded;
  }
}

/// A deep-indigo "assurance card" for the home feed — a celestial night-sky card
/// with the heading and three assurance columns (soft-ringed icon tile + clean
/// white label). Content stays portal-managed (homeSections/trust); only the look
/// is fixed here. No more gold-italic footer.
class TrustBanner extends ConsumerWidget {
  const TrustBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(homeTrustProvider).valueOrNull;
    if (data == null || data.isEmpty) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        boxShadow: Ob.softShadow,
        gradient: const RadialGradient(
          center: Alignment(-0.7, -1),
          radius: 1.3,
          colors: [Color(0xFF4B3A8F), Color(0xFF2E2159), Color(0xFF241A47)],
          stops: [0, 0.55, 1],
        ),
      ),
      child: Stack(
        children: [
          // Faint gold glow, upper-right — a hint of celestial warmth.
          Positioned(
            right: -34,
            top: -34,
            child: IgnorePointer(
              child: Container(
                width: 130,
                height: 130,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(colors: [Color(0x40EAD079), Color(0x00EAD079)]),
                ),
              ),
            ),
          ),
          Column(
            children: [
              Text(data.title,
                  textAlign: TextAlign.center,
                  style: Ob.title.copyWith(fontSize: 17, color: Colors.white)),
              if (data.subtitle.isNotEmpty) ...[
                const SizedBox(height: 5),
                Text(data.subtitle,
                    textAlign: TextAlign.center,
                    style: Ob.note.copyWith(fontSize: 12, color: Colors.white70)),
              ],
              const SizedBox(height: 15),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final it in data.items) Expanded(child: _TrustCol(item: it)),
                ],
              ),
              if (data.footer.isNotEmpty) ...[
                const SizedBox(height: 14),
                Text(data.footer,
                    textAlign: TextAlign.center,
                    style: Ob.note.copyWith(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      color: Colors.white.withValues(alpha: 0.66),
                    )),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

/// One assurance column: a soft-ringed icon tile + a clean white label.
class _TrustCol extends StatelessWidget {
  const _TrustCol({required this.item});
  final TrustItem item;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 3),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(13),
              color: Colors.white.withValues(alpha: 0.08),
              border: Border.all(color: const Color(0xFFEAD079).withValues(alpha: 0.5)),
            ),
            child: Icon(_iconFor(item.icon), color: Colors.white, size: 21),
          ),
          const SizedBox(height: 8),
          Text(item.title,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700, height: 1.15)),
          if (item.subtitle.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(item.subtitle,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.6), fontSize: 9.5, height: 1.2)),
          ],
        ],
      ),
    );
  }
}
