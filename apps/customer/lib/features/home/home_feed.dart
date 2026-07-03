import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../astrologer/astrologer_card.dart';
import '../search/search_screen.dart';
import '../tools/horoscope_screen.dart';
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
    final initial = name.isEmpty ? '★' : name.substring(0, 1).toUpperCase();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          // Profile entry point → switches the bottom nav to the Profile tab.
          GestureDetector(
            onTap: () => ref.read(homeTabProvider.notifier).state = 4,
            child: Container(
              width: 46,
              height: 46,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                gradient: Ob.goldGradient,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
                boxShadow: Ob.softShadow,
              ),
              child: Text(initial, style: Ob.title.copyWith(color: Colors.white, fontSize: 20)),
            ),
          ),
          Expanded(child: Center(child: const AppLogo(height: 30))),
          GestureDetector(
            onTap: () => context.push('/recharge'),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(gradient: Ob.goldGradient, borderRadius: BorderRadius.circular(14)),
              child: Row(
                children: [
                  const Icon(Icons.account_balance_wallet_rounded, size: 17, color: Ob.navy),
                  const SizedBox(width: 6),
                  Text(Money.formatPaise(profile?.spendablePaise ?? 0),
                      style: Ob.option.copyWith(fontSize: 13, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------- tool tabs --
class _ToolTabs extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          _tool(context, Icons.brightness_5_rounded, 'Daily\nHoroscope',
              () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const HoroscopeScreen()))),
          _tool(context, Icons.favorite_rounded, 'Kundali\nMatch', () => _comingSoon(context, 'Kundali Match')),
          _tool(context, Icons.grid_view_rounded, 'Janam\nKundali', () => _comingSoon(context, 'Janam Kundali')),
          _tool(context, Icons.card_giftcard_rounded, 'Free\nServices', () => _comingSoon(context, 'Free Services')),
        ],
      ),
    );
  }

  Widget _tool(BuildContext context, IconData icon, String label, VoidCallback onTap) {
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
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(color: Ob.lavenderChip, borderRadius: BorderRadius.circular(14)),
                  child: Icon(icon, color: Ob.purple, size: 22),
                ),
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
        gradient: _grad(const [Color(0xFF8E6BD1), Color(0xFF5E3FBE)]),
        onGold: false,
        kicker: '✦ WELCOME GIFT',
        title: 'Start Your Free\nSession',
        subtitle: 'Your first chat is on us',
        cta: 'Start Now',
        illustration: Image.asset(Ob.gift, height: 122),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SearchScreen())),
      ),
      _banner(
        gradient: _grad(const [Color(0xFFEBC15A), Color(0xFFCB962C)]),
        onGold: true,
        kicker: '✦ DIVINE BLESSINGS',
        title: 'Book Group\nPujas',
        subtitle: 'Starting from ₹999',
        cta: 'Book Now',
        illustration: _omEmblem(),
        onTap: () => _comingSoon(context, 'Group Pujas'),
      ),
      _trustBanner(),
    ];
    return Column(
      children: [
        SizedBox(
          height: 190,
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
    required bool onGold,
    required String kicker,
    required String title,
    required String subtitle,
    required String cta,
    required Widget illustration,
    required VoidCallback onTap,
  }) {
    final text = onGold ? Ob.navy : Colors.white;
    final kColor = onGold ? const Color(0xFF7A5A16) : const Color(0xFFEAD79A);
    final sColor = onGold ? Ob.navy.withValues(alpha: 0.75) : const Color(0xFFE7DCFA);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(gradient: gradient, borderRadius: BorderRadius.circular(24), boxShadow: _bshadow),
          child: Stack(
            children: [
              Positioned(right: -8, bottom: -8, child: illustration),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(kicker,
                      style: Ob.note.copyWith(color: kColor, letterSpacing: 1.4, fontWeight: FontWeight.w600, fontSize: 11)),
                  const SizedBox(height: 6),
                  SizedBox(width: 195, child: Text(title, style: Ob.title.copyWith(color: text, fontSize: 25, height: 1.05))),
                  const SizedBox(height: 4),
                  SizedBox(width: 185, child: Text(subtitle, style: Ob.note.copyWith(color: sColor))),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
                    decoration: BoxDecoration(
                      gradient: onGold ? null : Ob.goldGradient,
                      color: onGold ? Ob.purpleDeep : null,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Text('$cta  →',
                        style: Ob.option.copyWith(
                            fontSize: 13, fontWeight: FontWeight.w600, color: onGold ? Colors.white : Ob.navy)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _omEmblem() => Container(
        width: 116,
        height: 116,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.92),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 3),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 14)],
        ),
        child: Text('ॐ',
            style: TextStyle(fontSize: 58, color: Ob.purpleDeep, fontWeight: FontWeight.w600, height: 1)),
      );

  Widget _trustBanner() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
        decoration: BoxDecoration(
            gradient: _grad(const [Color(0xFF3D2E7A), Color(0xFF2A2452)]),
            borderRadius: BorderRadius.circular(24),
            boxShadow: _bshadow),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('Why Millions Trust Us', style: Ob.title.copyWith(color: Colors.white, fontSize: 23)),
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
    );
  }

  Widget _trustItem(IconData icon, String label) => Expanded(
        child: Column(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(13)),
              child: Icon(icon, color: Colors.white, size: 20),
            ),
            const SizedBox(height: 8),
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
