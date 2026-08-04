import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../astrologer/astrologer_card.dart';

// ---- By NEED (topic) --------------------------------------------------------

/// The eight controlled discovery categories (mirror the `specializations` tag
/// list on the astrologer doc, and the portal picker).
class DiscoveryCategory {
  const DiscoveryCategory(this.tag, this.label, this.icon);
  final String tag;
  final String label;
  final IconData icon;
}

const kDiscoveryCategories = <DiscoveryCategory>[
  DiscoveryCategory('love', 'Love', Icons.favorite_rounded),
  DiscoveryCategory('marriage', 'Marriage', Icons.diversity_3_rounded),
  DiscoveryCategory('career', 'Career', Icons.work_rounded),
  DiscoveryCategory('money', 'Money', Icons.account_balance_wallet_rounded),
  DiscoveryCategory('health', 'Health', Icons.health_and_safety_rounded),
  DiscoveryCategory('education', 'Education', Icons.school_rounded),
  DiscoveryCategory('spirituality', 'Spirituality', Icons.self_improvement_rounded),
  DiscoveryCategory('remedies', 'Remedies', Icons.spa_rounded),
];

/// Astrologers (AI + human) carrying a given specialization tag.
final astrologersBySpecializationProvider =
    StreamProvider.autoDispose.family<List<Astrologer>, String>((ref, tag) {
  return ref.watch(astrologerRepositoryProvider).watchBySpecialization(tag);
});

// ---- By SKILL (school) ------------------------------------------------------

/// A browsable skill/school. `tags` are the underlying `expertise` values matched
/// (a "Vedic" skill folds in KP + Lal Kitab + Nadi so no chart-astrologer is
/// hidden). Palmistry shows astrologers tagged with it (any school can read palms).
class SkillCategory {
  const SkillCategory(this.label, this.icon, this.tags);
  final String label;
  final IconData icon;
  final List<String> tags;
}

const kSkillCategories = <SkillCategory>[
  SkillCategory('Vedic', Icons.auto_awesome_rounded,
      ['Vedic Astrology', 'KP System', 'KP Astrology', 'Lal Kitab', 'Nadi Astrology']),
  SkillCategory('Palmistry', Icons.back_hand_rounded, ['Palmistry']),
  SkillCategory('Numerology', Icons.calculate_rounded, ['Numerology']),
  SkillCategory('Tarot', Icons.style_rounded, ['Tarot']),
];

/// Astrologers matching a skill (keyed by its label; tags looked up internally).
final astrologersBySkillProvider =
    StreamProvider.autoDispose.family<List<Astrologer>, String>((ref, label) {
  final skill = kSkillCategories.firstWhere((s) => s.label == label);
  return ref.watch(astrologerRepositoryProvider).watchBySkillTags(skill.tags);
});

// ---- Shared list screen -----------------------------------------------------

/// Full-screen filtered astrologer list, reached by tapping a need/skill pill.
/// Reuses [AstrologerCard] so cards look identical to the rails and search.
class _AstrologerListScreen extends StatelessWidget {
  const _AstrologerListScreen({
    required this.title,
    required this.icon,
    required this.provider,
    required this.emptyLabel,
    this.requestedSkill,
  });
  final String title;
  final IconData icon;
  final ProviderListenable<AsyncValue<List<Astrologer>>> provider;
  final String emptyLabel;
  /// Passed to each card (→ consultation) when this is a skill browse, so the AI
  /// can open skill-led (e.g. palm-led for Palmistry). Null for need browses.
  final String? requestedSkill;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 20),
          const SizedBox(width: 8),
          Text(title),
        ]),
      ),
      body: Consumer(builder: (context, ref, _) {
        final async = ref.watch(provider);
        final bottom = AppSpacing.lg + MediaQuery.of(context).padding.bottom;
        return async.when(
          loading: () => ListView.builder(
            padding: EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, bottom),
            itemCount: 5,
            itemBuilder: (_, __) => const Padding(
              padding: EdgeInsets.only(bottom: AppSpacing.md),
              child: AstrologerCardSkeleton(),
            ),
          ),
          error: (_, __) => const EmptyState(
            icon: Icons.cloud_off_rounded,
            title: 'Could not load',
            message: 'Please check your connection and try again.',
          ),
          data: (list) => list.isEmpty
              ? EmptyState(icon: icon, title: emptyLabel, message: 'Try another category or browse all astrologers.')
              : ListView.builder(
                  padding: EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, bottom),
                  itemCount: list.length,
                  itemBuilder: (_, i) => Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: AstrologerCard(astrologer: list[i], requestedSkill: requestedSkill),
                  ),
                ),
        );
      }),
    );
  }
}

// ---- Home strips ------------------------------------------------------------

/// Compact horizontal pill strips for the home feed: one by NEED, one by SKILL.
class CategoryRow extends StatelessWidget {
  const CategoryRow({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _PillStrip(
          heading: 'What do you need guidance on?',
          pills: [
            for (final c in kDiscoveryCategories)
              _PillData(c.icon, c.label, () => _open(context,
                  title: c.label, icon: c.icon, emptyLabel: 'No ${c.label.toLowerCase()} astrologers yet',
                  provider: astrologersBySpecializationProvider(c.tag))),
          ],
        ),
        const SizedBox(height: 10),
        _PillStrip(
          heading: 'Browse by skill',
          pills: [
            for (final s in kSkillCategories)
              _PillData(s.icon, s.label, () => _open(context,
                  title: s.label, icon: s.icon, emptyLabel: 'No ${s.label} astrologers yet',
                  provider: astrologersBySkillProvider(s.label), requestedSkill: s.label)),
          ],
        ),
      ],
    );
  }

  void _open(BuildContext context, {
    required String title,
    required IconData icon,
    required String emptyLabel,
    required ProviderListenable<AsyncValue<List<Astrologer>>> provider,
    String? requestedSkill,
  }) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => _AstrologerListScreen(
        title: title, icon: icon, provider: provider, emptyLabel: emptyLabel,
        requestedSkill: requestedSkill,
      ),
    ));
  }
}

class _PillData {
  const _PillData(this.icon, this.label, this.onTap);
  final IconData icon;
  final String label;
  final VoidCallback onTap;
}

class _PillStrip extends StatelessWidget {
  const _PillStrip({required this.heading, required this.pills});
  final String heading;
  final List<_PillData> pills;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 4, AppSpacing.lg, 9),
          child: Text(heading, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
        ),
        SizedBox(
          height: 38,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            itemCount: pills.length,
            separatorBuilder: (_, __) => const SizedBox(width: 9),
            itemBuilder: (_, i) => _Pill(data: pills[i]),
          ),
        ),
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.data});
  final _PillData data;

  @override
  Widget build(BuildContext context) {
    const purple = Color(0xFF2E4A8F);
    const ink = Color(0xFF2A2340);
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: data.onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: purple.withValues(alpha: 0.22)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(data.icon, size: 16, color: purple),
              const SizedBox(width: 7),
              Text(data.label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: ink)),
            ],
          ),
        ),
      ),
    );
  }
}
