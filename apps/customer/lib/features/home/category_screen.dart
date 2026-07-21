import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../astrologer/astrologer_card.dart';

/// The eight controlled discovery categories (mirror the `specializations` tag
/// list on the astrologer doc, and the portal picker). Icon + label are display;
/// `tag` is the stored value queried against.
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

/// Astrologers (AI + human) carrying a given specialization tag, consultable
/// first then by rating. autoDispose family so each category streams only while open.
final astrologersBySpecializationProvider =
    StreamProvider.autoDispose.family<List<Astrologer>, String>((ref, tag) {
  return ref.watch(astrologerRepositoryProvider).watchBySpecialization(tag);
});

/// Full-screen list for one discovery category, reached by tapping a category
/// chip on the home feed. Reuses [AstrologerCard] so cards look identical to the
/// rails and search.
class CategoryScreen extends ConsumerWidget {
  const CategoryScreen({super.key, required this.category});
  final DiscoveryCategory category;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(astrologersBySpecializationProvider(category.tag));
    final bottom = AppSpacing.lg + MediaQuery.of(context).padding.bottom;
    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(category.icon, size: 20),
            const SizedBox(width: 8),
            Text(category.label),
          ],
        ),
      ),
      body: async.when(
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
            ? EmptyState(
                icon: category.icon,
                title: 'No ${category.label.toLowerCase()} astrologers yet',
                message: 'Try another category or browse all astrologers.',
              )
            : ListView.builder(
                padding: EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, bottom),
                itemCount: list.length,
                itemBuilder: (_, i) => Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: AstrologerCard(astrologer: list[i]),
                ),
              ),
      ),
    );
  }
}

/// A compact, horizontally-scrolling STRIP of category pills for the home feed —
/// "find an astrologer by what you need". A single low row (icon + label inline),
/// space-efficient and clean. Each opens the matching [CategoryScreen].
class CategoryRow extends StatelessWidget {
  const CategoryRow({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(AppSpacing.lg, 4, AppSpacing.lg, 9),
          child: Text('What do you need guidance on?',
              style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
        ),
        SizedBox(
          height: 38,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            itemCount: kDiscoveryCategories.length,
            separatorBuilder: (_, __) => const SizedBox(width: 9),
            itemBuilder: (_, i) => _CategoryPill(category: kDiscoveryCategories[i]),
          ),
        ),
      ],
    );
  }
}

class _CategoryPill extends StatelessWidget {
  const _CategoryPill({required this.category});
  final DiscoveryCategory category;

  @override
  Widget build(BuildContext context) {
    const purple = Color(0xFF7E57C2);
    const ink = Color(0xFF2A2340);
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => CategoryScreen(category: category))),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: purple.withValues(alpha: 0.22)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(category.icon, size: 16, color: purple),
              const SizedBox(width: 7),
              Text(category.label,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: ink)),
            ],
          ),
        ),
      ),
    );
  }
}
