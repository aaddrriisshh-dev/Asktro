import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../astrologer/astrologer_card.dart';
import '../search/search_screen.dart';
import '../tools/horoscope_screen.dart';
import '../settings/language_sheet.dart';
import '../profile/support_screen.dart';
import '../profile_setup/onboarding_style.dart';
import '../profile_setup/onboarding_widgets.dart';

final _onlineProvider = StreamProvider.autoDispose<List<Astrologer>>(
    (ref) => ref.watch(astrologerRepositoryProvider).watchOnline());
final _featuredProvider = StreamProvider.autoDispose<List<Astrologer>>(
    (ref) => ref.watch(astrologerRepositoryProvider).watchFeatured());
final _topRatedProvider = StreamProvider.autoDispose<List<Astrologer>>(
    (ref) => ref.watch(astrologerRepositoryProvider).watchTopRated());
final _newestProvider = StreamProvider.autoDispose<List<Astrologer>>(
    (ref) => ref.watch(astrologerRepositoryProvider).watchNewest());

void _comingSoon(BuildContext context, String title) {
  showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (_) => Container(
      decoration: const BoxDecoration(
        color: Ob.bgColor,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: const EdgeInsets.fromLTRB(24, 22, 24, 34),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: const BoxDecoration(gradient: Ob.goldCircle, shape: BoxShape.circle),
            child: const Icon(Icons.auto_awesome_rounded, color: Colors.white, size: 30),
          ),
          const SizedBox(height: 16),
          Text(title, style: Ob.title, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text(
            "This feature is on its way — we're aligning the stars. Check back soon ✦",
            style: Ob.subtitle,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          GoldButton(label: 'Got it', icon: null, onPressed: () => Navigator.pop(context)),
        ],
      ),
    ),
  );
}

class HomeFeed extends ConsumerWidget {
  const HomeFeed({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(myProfileProvider).valueOrNull;
    return Container(
      color: Ob.bgColor,
      child: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: Ob.purple,
          onRefresh: () async {
            ref.invalidate(_onlineProvider);
            ref.invalidate(_featuredProvider);
            ref.invalidate(_topRatedProvider);
            ref.invalidate(_newestProvider);
          },
          child: ListView(
            padding: const EdgeInsets.only(top: 10, bottom: 32),
            children: [
              _topBar(context, ref, profile),
              const SizedBox(height: 20),
              _ToolTabs(),
              const SizedBox(height: 20),
              const _HomeBanners(),
              const SizedBox(height: 6),
              _Rail(title: 'Online Now', provider: _onlineProvider),
              _Rail(title: 'Featured', provider: _featuredProvider),
              _Rail(title: 'Top Rated', provider: _topRatedProvider),
              _Rail(title: 'Recently Joined', provider: _newestProvider),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _topBar(BuildContext context, WidgetRef ref, UserProfile? profile) {
    final name = (profile?.name ?? '').trim();
    final first = name.isEmpty ? 'there' : name.split(' ').first;
    final initial = name.isEmpty ? '★' : name.substring(0, 1).toUpperCase();
    final photo = profile?.profilePhoto;
    final hasPhoto = photo != null && photo.isNotEmpty;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          // Profile photo + a little hamburger badge → opens the Profile page.
          GestureDetector(
            onTap: () => ref.read(homeTabProvider.notifier).state = 4,
            child: SizedBox(
              width: 50,
              height: 48,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 46,
                    height: 46,
                    alignment: Alignment.center,
                    clipBehavior: Clip.antiAlias,
                    decoration: BoxDecoration(
                      gradient: hasPhoto ? null : Ob.goldGradient,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                      boxShadow: Ob.softShadow,
                    ),
                    child: hasPhoto
                        ? Image.network(photo, width: 46, height: 46, fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) =>
                                Text(initial, style: Ob.title.copyWith(color: Colors.white, fontSize: 20)))
                        : Text(initial, style: Ob.title.copyWith(color: Colors.white, fontSize: 20)),
                  ),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      width: 20,
                      height: 20,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: Ob.softShadow),
                      child: const Icon(Icons.menu_rounded, size: 12, color: Ob.navy),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 10),
          Flexible(
            child: Text('Hi $first',
                style: Ob.title.copyWith(fontSize: 18), overflow: TextOverflow.ellipsis),
          ),
          const SizedBox(width: 8),
          _addCash(context),
          const SizedBox(width: 8),
          _iconCircle(Icons.translate_rounded, () => showLanguageSheet(context)),
          const SizedBox(width: 6),
          _iconCircle(Icons.headset_mic_rounded,
              () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SupportScreen()))),
        ],
      ),
    );
  }

  Widget _addCash(BuildContext context) => GestureDetector(
        onTap: () => context.push('/recharge'),
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 8, 6, 8),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: Ob.border),
            boxShadow: Ob.softShadow,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.account_balance_wallet_outlined, size: 17, color: Ob.navy),
              const SizedBox(width: 6),
              Text('Add Cash', style: Ob.option.copyWith(fontSize: 13, fontWeight: FontWeight.w600)),
              const SizedBox(width: 6),
              Container(
                width: 22,
                height: 22,
                alignment: Alignment.center,
                decoration: const BoxDecoration(color: Ob.navy, shape: BoxShape.circle),
                child: const Icon(Icons.add, size: 14, color: Colors.white),
              ),
            ],
          ),
        ),
      );

  Widget _iconCircle(IconData icon, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: Colors.white,
            shape: BoxShape.circle,
            border: Border.all(color: Ob.border),
            boxShadow: Ob.softShadow,
          ),
          child: Icon(icon, size: 19, color: Ob.navy),
        ),
      );
}

// ------------------------------------------------------------- tool tabs --
class _ToolTabs extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          _tool(context, 'assets/onboarding/tool_horoscope.png', 'Daily\nHoroscope',
              () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const HoroscopeScreen()))),
          _tool(context, 'assets/onboarding/tool_match.png', 'Kundali\nMatch', () => _comingSoon(context, 'Kundali Match')),
          _tool(context, 'assets/onboarding/tool_kundali.png', 'Janam\nKundali', () => _comingSoon(context, 'Janam Kundali')),
          _tool(context, 'assets/onboarding/tool_free.png', 'Free\nServices', () => _comingSoon(context, 'Free Services')),
        ],
      ),
    );
  }

  Widget _tool(BuildContext context, String asset, String label, VoidCallback onTap) {
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 5),
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Ob.border, width: 1),
              boxShadow: Ob.softShadow,
            ),
            child: Column(
              children: [
                Image.asset(asset, width: 46, height: 46),
                const SizedBox(height: 8),
                Text(label,
                    textAlign: TextAlign.center,
                    style: Ob.note.copyWith(color: Ob.navy, fontWeight: FontWeight.w600, height: 1.2)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// -------------------------------------------------------------- banners --
class _HomeBanners extends StatefulWidget {
  const _HomeBanners();
  @override
  State<_HomeBanners> createState() => _HomeBannersState();
}

class _HomeBannersState extends State<_HomeBanners> {
  final _controller = PageController(viewportFraction: 0.9);
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final banners = [
      _banner(
        gradient: _grad(const [Color(0xFF9E7BE0), Color(0xFF7E57C2), Color(0xFF5E3FBE)]),
        kicker: '✦ WELCOME GIFT',
        title: 'Start Your Free\nSession',
        subtitle: 'Your first chat is on us',
        cta: 'Start Now',
        illustration: Image.asset(Ob.gift, height: 128),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SearchScreen())),
      ),
      _banner(
        gradient: _grad(const [Color(0xFF6A47C7), Color(0xFF432B85), Color(0xFF2C1E5C)]),
        kicker: '✦ DIVINE BLESSINGS',
        title: 'Book Group\nPujas',
        subtitle: 'By verified pandits',
        cta: 'Book Now',
        illustration: Image.asset(Ob.ganesha, height: 176),
        onTap: () => _comingSoon(context, 'Group Pujas'),
      ),
      _trustBanner(),
    ];
    return Column(
      children: [
        SizedBox(
          height: 196,
          child: PageView(
            controller: _controller,
            onPageChanged: (i) => setState(() => _page = i),
            children: banners,
          ),
        ),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(banners.length, (i) {
            final on = i == _page;
            return AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: on ? 20 : 7,
              height: 7,
              decoration: BoxDecoration(
                color: on ? Ob.purple : const Color(0xFFCABFE6),
                borderRadius: BorderRadius.circular(4),
              ),
            );
          }),
        ),
      ],
    );
  }

  LinearGradient _grad(List<Color> c) =>
      LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: c);

  List<BoxShadow> get _bshadow =>
      [BoxShadow(color: Colors.black.withValues(alpha: 0.14), blurRadius: 20, offset: const Offset(0, 10))];

  Widget _banner({
    required LinearGradient gradient,
    required String kicker,
    required String title,
    required String subtitle,
    required String cta,
    required Widget illustration,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          clipBehavior: Clip.antiAlias,
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
          decoration: BoxDecoration(gradient: gradient, borderRadius: BorderRadius.circular(24), boxShadow: _bshadow),
          child: Stack(
            children: [
              Positioned(right: -6, bottom: -10, child: illustration),
              // Gradient "wipe": a left-to-right scrim so the copy stays crisp
              // over the illustration.
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.centerLeft,
                      end: Alignment.centerRight,
                      colors: [Colors.black.withValues(alpha: 0.22), Colors.transparent],
                      stops: const [0.0, 0.62],
                    ),
                  ),
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(kicker,
                      style: Ob.note.copyWith(
                          color: const Color(0xFFEAD79A), letterSpacing: 1.4, fontWeight: FontWeight.w600, fontSize: 11)),
                  const SizedBox(height: 6),
                  SizedBox(width: 195, child: Text(title, style: Ob.title.copyWith(color: Colors.white, fontSize: 25, height: 1.05))),
                  const SizedBox(height: 4),
                  SizedBox(width: 185, child: Text(subtitle, style: Ob.note.copyWith(color: const Color(0xFFE7DCFA)))),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
                    decoration: BoxDecoration(gradient: Ob.goldGradient, borderRadius: BorderRadius.circular(14)),
                    child: Text('$cta  →',
                        style: Ob.option.copyWith(fontSize: 13, fontWeight: FontWeight.w600, color: Ob.navy)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _trustBanner() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
            gradient: _grad(const [Color(0xFF5238A0), Color(0xFF2E2159)]),
            borderRadius: BorderRadius.circular(24),
            boxShadow: _bshadow),
        child: Stack(
          children: [
            // faint zodiac-wheel watermark, top-right
            Positioned(
              right: -46,
              top: -36,
              child: IgnorePointer(
                child: Opacity(opacity: 0.10, child: Image.asset(Ob.zodiacWheel, width: 190)),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('Why Millions Trust Us', style: Ob.title.copyWith(color: Colors.white, fontSize: 22)),
                  const SizedBox(height: 8),
                  // gold divider with a centred sparkle
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(width: 34, height: 1.2, color: Ob.gold.withValues(alpha: 0.55)),
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 7),
                        child: Icon(Icons.auto_awesome, color: Ob.gold, size: 13),
                      ),
                      Container(width: 34, height: 1.2, color: Ob.gold.withValues(alpha: 0.55)),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      _trustItem(Icons.verified_user_rounded, 'Money-Back\nGuarantee'),
                      _trustItem(Icons.workspace_premium_rounded, 'Verified\nExperts'),
                      _trustItem(Icons.lock_rounded, '100%\nPrivate'),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _trustItem(IconData icon, String label) => Expanded(
        child: Column(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Colors.white.withValues(alpha: 0.14), Colors.white.withValues(alpha: 0.05)],
                ),
                shape: BoxShape.circle,
                border: Border.all(color: Ob.gold.withValues(alpha: 0.55), width: 1.2),
              ),
              child: Icon(icon, color: const Color(0xFFF3D97C), size: 21),
            ),
            const SizedBox(height: 9),
            Text(label,
                textAlign: TextAlign.center,
                style: Ob.note.copyWith(color: Colors.white, fontSize: 10.5, height: 1.2, fontWeight: FontWeight.w600)),
          ],
        ),
      );
}

// ---------------------------------------------------------------- rails --
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
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 10),
          child: Text(title, style: Ob.title.copyWith(fontSize: 23)),
        ),
        async.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20),
            child: AstrologerCardSkeleton(),
          ),
          error: (_, __) => Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Text('Could not load $title', style: Ob.note),
          ),
          data: (list) {
            if (list.isEmpty) {
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Text('No astrologers here yet.', style: Ob.note),
              );
            }
            return Column(
              children: [
                for (final a in list)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
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
