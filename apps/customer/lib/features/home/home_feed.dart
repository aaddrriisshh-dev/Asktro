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

const _purpleGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [Color(0xFF8E6BD1), Color(0xFF5E3FBE)],
);

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

  String _firstName(String? name) {
    final n = (name ?? '').trim();
    if (n.isEmpty || n == 'Guest') return 'there';
    return n.split(' ').first;
  }

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
              _header(context, profile),
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

  Widget _header(BuildContext context, UserProfile? profile) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Namaste, ${_firstName(profile?.name)} ✦', style: Ob.title),
                const SizedBox(height: 2),
                Text('The stars have guidance for you today', style: Ob.subtitle),
              ],
            ),
          ),
          _circleBtn(Icons.search_rounded,
              () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SearchScreen()))),
          const SizedBox(width: 10),
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

  Widget _circleBtn(IconData icon, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: Ob.softShadow),
          child: Icon(icon, color: Ob.navy, size: 20),
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
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), boxShadow: Ob.softShadow),
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
      _promo(context,
          kicker: '✦ WELCOME GIFT',
          title: 'Start Your Free Session',
          subtitle: 'Your first chat with an astrologer is on us',
          cta: 'Start Now',
          icon: Icons.chat_bubble_rounded,
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SearchScreen()))),
      _promo(context,
          kicker: '✦ DIVINE BLESSINGS',
          title: 'Book Group Pujas',
          subtitle: 'Starting from ₹999 · by verified pandits',
          cta: 'Book Now',
          icon: Icons.self_improvement_rounded,
          onTap: () => _comingSoon(context, 'Group Pujas')),
      _trust(context),
    ];
    return Column(
      children: [
        SizedBox(
          height: 172,
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

  Widget _promo(BuildContext context,
      {required String kicker,
      required String title,
      required String subtitle,
      required String cta,
      required IconData icon,
      required VoidCallback onTap}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: _purpleGradient,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [BoxShadow(color: const Color(0xFF5E3FBE).withValues(alpha: 0.3), blurRadius: 22, offset: const Offset(0, 12))],
        ),
        child: Stack(
          children: [
            Positioned(
              right: -6,
              bottom: -6,
              child: Icon(icon, size: 118, color: Colors.white.withValues(alpha: 0.12)),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(kicker,
                    style: Ob.note.copyWith(color: const Color(0xFFEAD79A), letterSpacing: 1.5, fontWeight: FontWeight.w600, fontSize: 11)),
                const SizedBox(height: 6),
                SizedBox(
                  width: 210,
                  child: Text(title, style: Ob.title.copyWith(color: Colors.white, fontSize: 27)),
                ),
                const SizedBox(height: 4),
                SizedBox(width: 210, child: Text(subtitle, style: Ob.note.copyWith(color: const Color(0xFFE7DCFA)))),
                const SizedBox(height: 12),
                GestureDetector(
                  onTap: onTap,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
                    decoration: BoxDecoration(gradient: Ob.goldGradient, borderRadius: BorderRadius.circular(14)),
                    child: Text('$cta  →', style: Ob.option.copyWith(fontSize: 13, fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _trust(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
        decoration: BoxDecoration(
          gradient: _purpleGradient,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [BoxShadow(color: const Color(0xFF5E3FBE).withValues(alpha: 0.3), blurRadius: 22, offset: const Offset(0, 12))],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('Why Millions Trust Us',
                style: Ob.title.copyWith(color: Colors.white, fontSize: 23)),
            const SizedBox(height: 12),
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
