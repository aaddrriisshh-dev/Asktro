import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../astrologer/astrologer_card.dart';
import '../search/search_screen.dart';

final _onlineProvider = StreamProvider.autoDispose<List<Astrologer>>(
    (ref) => ref.watch(astrologerRepositoryProvider).watchOnline());
final _featuredProvider = StreamProvider.autoDispose<List<Astrologer>>(
    (ref) => ref.watch(astrologerRepositoryProvider).watchFeatured());
final _topRatedProvider = StreamProvider.autoDispose<List<Astrologer>>(
    (ref) => ref.watch(astrologerRepositoryProvider).watchTopRated());
final _newestProvider = StreamProvider.autoDispose<List<Astrologer>>(
    (ref) => ref.watch(astrologerRepositoryProvider).watchNewest());
final _homeBannersProvider = StreamProvider.autoDispose<List<PromoBanner>>(
    (ref) => ref.watch(catalogRepositoryProvider).watchBanners('home'));

String _greeting() {
  final h = DateTime.now().hour;
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

class HomeFeed extends ConsumerWidget {
  const HomeFeed({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(myProfileProvider).valueOrNull;
    final banners = ref.watch(_homeBannersProvider).valueOrNull ?? const [];

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(_onlineProvider);
          ref.invalidate(_featuredProvider);
          ref.invalidate(_topRatedProvider);
          ref.invalidate(_newestProvider);
        },
        child: ListView(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_greeting(), style: AppTypography.caption),
                        Text('${(profile?.name ?? 'there')} 👋', style: AppTypography.title),
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: () => context.push('/recharge'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
                      decoration: BoxDecoration(
                        color: AppColors.accentLavender,
                        borderRadius: BorderRadius.circular(AppRadius.chip),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.account_balance_wallet, size: 18, color: AppColors.primary),
                          const SizedBox(width: 6),
                          Text(Money.formatPaise(profile?.spendablePaise ?? 0),
                              style: AppTypography.body.copyWith(
                                  color: AppColors.primary, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              child: GestureDetector(
                onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const SearchScreen())),
                child: AbsorbPointer(
                  child: TextField(
                    decoration: InputDecoration(
                      hintText: 'Search astrologers...',
                      prefixIcon: const Icon(Icons.search, color: AppColors.textSecondary),
                      border: OutlineInputBorder(borderRadius: AppRadius.searchR, borderSide: BorderSide.none),
                    ),
                  ),
                ),
              ),
            ),
            if (banners.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.lg),
              _BannerCarousel(banners: banners),
            ],
            _Rail(title: 'Online Now', provider: _onlineProvider),
            _Rail(title: 'Featured', provider: _featuredProvider),
            _Rail(title: 'Top Rated', provider: _topRatedProvider),
            _Rail(title: 'Recently Joined', provider: _newestProvider),
            const SizedBox(height: AppSpacing.xxl),
          ],
        ),
      ),
    );
  }
}

class _Rail extends ConsumerWidget {
  const _Rail({required this.title, required this.provider});
  final String title;
  final AutoDisposeStreamProvider<List<Astrologer>> provider;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(provider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.xl, AppSpacing.lg, AppSpacing.sm),
          child: Text(title, style: AppTypography.subtitle),
        ),
        async.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: AstrologerCardSkeleton(),
          ),
          error: (_, __) => Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: Text('Could not load $title', style: AppTypography.caption),
          ),
          data: (list) {
            if (list.isEmpty) {
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                child: Text('No astrologers here yet.', style: AppTypography.caption),
              );
            }
            return Column(
              children: [
                for (final a in list)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.md),
                    child: AstrologerCard(astrologer: a),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _BannerCarousel extends StatefulWidget {
  const _BannerCarousel({required this.banners});
  final List<PromoBanner> banners;

  @override
  State<_BannerCarousel> createState() => _BannerCarouselState();
}

class _BannerCarouselState extends State<_BannerCarousel> {
  final _controller = PageController(viewportFraction: 0.9);
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          height: 150,
          child: PageView.builder(
            controller: _controller,
            onPageChanged: (i) => setState(() => _page = i),
            itemCount: widget.banners.length,
            itemBuilder: (_, i) {
              final b = widget.banners[i];
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: GradientCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(b.title,
                          style: AppTypography.subtitle.copyWith(color: Colors.white),
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 6),
                      Text(b.subtitle,
                          style: AppTypography.caption.copyWith(color: Colors.white70),
                          maxLines: 2, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(widget.banners.length, (i) {
            final active = i == _page;
            return AnimatedContainer(
              duration: AppSizes.tapAnim,
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: active ? 18 : 6,
              height: 6,
              decoration: BoxDecoration(
                color: active ? AppColors.primary : AppColors.secondary.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(3),
              ),
            );
          }),
        ),
      ],
    );
  }
}
