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

/// The whole "Why people trust Zodia" band — a portal-managed home section
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

/// Full-bleed celestial trust band for the home feed (the original look the
/// founder preferred). Reaches both screen edges and sits on a soft celestial
/// ground with a faint zodiac watermark. Only two things changed from the very
/// first version: a richer background, and the footer is no longer italic.
class TrustBanner extends ConsumerWidget {
  const TrustBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(homeTrustProvider).valueOrNull;
    if (data == null || data.isEmpty) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.only(top: 22, bottom: 20),
      // New background — a slightly richer lavender→lilac→warm-ivory dusk, still
      // light so the white assurance cards read clearly on top.
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFE9DEFF), Color(0xFFF1E7FF), Color(0xFFFCF3E6)],
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -30,
            top: -18,
            child: IgnorePointer(
              child: Opacity(opacity: 0.07, child: Image.asset(Ob.zodiacWheel, width: 150)),
            ),
          ),
          Column(
            children: [
              // ---- heading ----
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.auto_awesome, size: 13, color: Ob.gold),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            data.title,
                            textAlign: TextAlign.center,
                            style: Ob.title.copyWith(fontSize: 26),
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Icon(Icons.auto_awesome, size: 13, color: Ob.gold),
                      ],
                    ),
                    if (data.subtitle.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        data.subtitle,
                        textAlign: TextAlign.center,
                        style: Ob.subtitle.copyWith(fontSize: 13.5),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 16),
              // ---- assurance rows ----
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Column(
                  children: [
                    for (var i = 0; i < data.items.length; i++) ...[
                      _TrustRow(item: data.items[i]),
                      if (i != data.items.length - 1) const SizedBox(height: 10),
                    ],
                  ],
                ),
              ),
              if (data.footer.isNotEmpty) ...[
                const SizedBox(height: 18),
                _FooterStrip(text: data.footer),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _TrustRow extends StatelessWidget {
  const _TrustRow({required this.item});
  final TrustItem item;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: BoxDecoration(
        color: Ob.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Ob.border),
        boxShadow: Ob.softShadow,
      ),
      child: Row(
        children: [
          // Gold-gradient medallion with the assurance glyph.
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              gradient: Ob.goldCircle,
              shape: BoxShape.circle,
              boxShadow: Ob.goldShadow,
            ),
            child: Icon(_iconFor(item.icon), color: Colors.white, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  item.title,
                  style: Ob.noteTitle.copyWith(fontSize: 15.5, fontWeight: FontWeight.w700),
                ),
                if (item.subtitle.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(item.subtitle, style: Ob.note.copyWith(fontSize: 12.5)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FooterStrip extends StatelessWidget {
  const _FooterStrip({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _hairline(),
        const SizedBox(width: 10),
        const Icon(Icons.auto_awesome, size: 12, color: Ob.gold),
        const SizedBox(width: 7),
        Flexible(
          child: Text(
            text,
            textAlign: TextAlign.center,
            // No longer italic — a clean, upright gold caption.
            style: Ob.note.copyWith(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: Ob.goldDeep,
              letterSpacing: 0.3,
            ),
          ),
        ),
        const SizedBox(width: 7),
        const Icon(Icons.auto_awesome, size: 12, color: Ob.gold),
        const SizedBox(width: 10),
        _hairline(),
      ],
    );
  }

  Widget _hairline() => Container(
        width: 26,
        height: 1,
        decoration: const BoxDecoration(
          gradient: LinearGradient(colors: [Color(0x00C6CCD6), Color(0x66C6CCD6)]),
        ),
      );
}
