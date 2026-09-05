import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../app/feature_flags.dart';
import 'home_continue_rail.dart';
import 'category_screen.dart';
import 'home_favorites_rail.dart';
import '../blogs/blogs.dart';
import 'trust_banner.dart';
import '../store/store_rail.dart';
import '../search/search_screen.dart';
import '../tools/horoscope_screen.dart';
import '../tools/janam_kundli_screen.dart';
import '../tools/kundali_match_screen.dart';
import '../tools/free_services_screen.dart';
import '../profile/support_screen.dart';
import '../notifications/notifications_tab.dart';
import '../profile_setup/onboarding_style.dart';
import '../profile_setup/onboarding_widgets.dart';
import '../wallet/promo_popup.dart';
import '../wallet/promo_surface.dart';

final _risingStarsProvider = StreamProvider.autoDispose<List<Astrologer>>(
    (ref) => ref.watch(astrologerRepositoryProvider).watchRisingStars(),);
// Human astrologers (paid) spotlighted first; AI (free) just below.
final _topHumanProvider = StreamProvider.autoDispose<List<Astrologer>>(
    (ref) => ref.watch(astrologerRepositoryProvider).watchTopHuman(),);
final _topAiProvider = StreamProvider.autoDispose<List<Astrologer>>(
    (ref) => ref.watch(astrologerRepositoryProvider).watchTopAI(),);
final _homeBannersProvider = StreamProvider.autoDispose<List<PromoBanner>>(
    (ref) => ref.watch(catalogRepositoryProvider).watchBanners('home'),);

void _comingSoon(BuildContext context, String title) {
  showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (ctx) => Container(
      decoration: const BoxDecoration(
        color: Ob.bgColor,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: EdgeInsets.fromLTRB(24, 22, 24, 34 + MediaQuery.of(ctx).padding.bottom),
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
      child: RefreshIndicator(
        color: Ob.purple,
        onRefresh: () async {
          ref.invalidate(_risingStarsProvider);
          ref.invalidate(_topHumanProvider);
          ref.invalidate(_topAiProvider);
        },
        child: ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            _celestialTop(context, ref, profile),
            const SizedBox(height: 18),
            const _HomeBanners(),
            const SizedBox(height: 12),
            // Discovery by need — tap a category to see AI + human astrologers
            // who specialise in it.
            const CategoryRow(),
            const SizedBox(height: 6),
            // Retention surfaces — resume a recent chat, and your adopted
            // astrologers. Each hides itself when the user has none yet.
            const ContinueRail(),
            const FavoritesRail(),
            // Verified (human) astrologers first — the paid consults. Auto-hides
            // until real humans are added from the portal.
            _AstroCarousel(
                title: 'Asktro Verified Astrologers',
                provider: _topHumanProvider,
                hideWhenEmpty: true,
                titleBadge: const VerifiedBadge(size: 18),),
            // The AI personas, presented as "New Astrologers" (each card + profile
            // still carries the required AI badge). Free & unlimited to chat.
            _AstroCarousel(title: 'New Astrologers', provider: _topAiProvider),
            _AstroCarousel(
                title: 'Rising Stars',
                provider: _risingStarsProvider,
                onlyRisingStars: true,),
            const SizedBox(height: 4),
            // ... hidden in free v1
            if (kMonetizationEnabled) const StoreRail(),
            const TrustBanner(),
            const SizedBox(height: 4),
            const RecentBlogsSection(),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  // The home "cockpit": greeting + wallet + the four tool tiles sit on a soft
  // celestial ground (faint zodiac watermark, gold sparkles) that reaches
  // behind the status bar and is closed by a gold sparkle divider — a clear
  // visual break from the astrologer directory below.
  Widget _celestialTop(BuildContext context, WidgetRef ref, UserProfile? profile) {
    final topPad = MediaQuery.of(context).padding.top;
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFEDE6FF), Color(0xFFF4EEFF), Color(0xFFFBF7EE)],
        ),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(30)),
        boxShadow: [BoxShadow(color: Color(0x14000000), blurRadius: 18, offset: Offset(0, 8))],
      ),
      child: Stack(
        children: [
          // Bold zodiac-wheel motif — a large wheel off the top-right corner
          // plus a smaller one bottom-left, both clearly readable.
          Positioned(
            right: -40,
            top: topPad - 20,
            child: IgnorePointer(
              child: Opacity(opacity: 0.17, child: Image.asset(Ob.zodiacWheel, width: 232)),
            ),
          ),
          Positioned(
            left: -34,
            bottom: -30,
            child: IgnorePointer(
              child: Opacity(opacity: 0.11, child: Image.asset(Ob.zodiacWheel, width: 150)),
            ),
          ),
          // A couple of soft gold sparkles for a celestial shimmer.
          Positioned(
              left: 26, top: topPad + 6,
              child: const IgnorePointer(child: Icon(Icons.auto_awesome, color: Color(0x66D4AF37), size: 12)),),
          Positioned(
              right: 128, top: topPad + 2,
              child: const IgnorePointer(child: Icon(Icons.auto_awesome, color: Color(0x4DD4AF37), size: 9)),),
          Column(
            children: [
              SizedBox(height: topPad + 12),
              _topBar(context, ref, profile),
              const SizedBox(height: 16),
              _headerHairline(),
              const SizedBox(height: 16),
              _ToolTabs(),
              const SizedBox(height: 18),
              _goldDivider(),
              const SizedBox(height: 16),
            ],
          ),
        ],
      ),
    );
  }

  // Whisper-thin lavender hairline that gives the greeting/wallet its own zone,
  // set apart from the tool tabs below — a minimal header segregation.
  Widget _headerHairline() => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Container(
          height: 1,
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [
              Ob.purple.withValues(alpha: 0),
              Ob.purple.withValues(alpha: 0.16),
              Ob.purple.withValues(alpha: 0),
            ],),
          ),
        ),
      );

  // Gold, sparkle-centred divider that marks the end of the tools zone.
  Widget _goldDivider() => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Row(
          children: [
            Expanded(
              child: Container(
                height: 1,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Ob.gold.withValues(alpha: 0), Ob.gold.withValues(alpha: 0.5)],
                  ),
                ),
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 9),
              child: Icon(Icons.auto_awesome, color: Ob.gold, size: 13),
            ),
            Expanded(
              child: Container(
                height: 1,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Ob.gold.withValues(alpha: 0.5), Ob.gold.withValues(alpha: 0)],
                  ),
                ),
              ),
            ),
          ],
        ),
      );

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
            onTap: () => ref.read(homeTabProvider.notifier).state = kProfileTabIndex,
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
                        ? CachedNetworkImage(
                            imageUrl: photo, width: 46, height: 46, fit: BoxFit.cover,
                            memCacheWidth: 140,
                            errorWidget: (_, __, ___) =>
                                Text(initial, style: Ob.title.copyWith(color: Colors.white, fontSize: 20)),)
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
          // Expanded (not Flexible) so the greeting fills the gap and the action
          // icons stay pinned to the right — otherwise, with fewer icons in the
          // free v1, they bunched up in the middle with blank space on the right.
          Expanded(
            child: Text('Hi $first',
                style: Ob.title.copyWith(fontSize: 18), overflow: TextOverflow.ellipsis,),
          ),
          // ... hidden in free v1
          if (kMonetizationEnabled) const SizedBox(width: 8),
          // ... hidden in free v1
          if (kMonetizationEnabled) _addCash(context),
          const SizedBox(width: 7),
          // Notification bell → the Notifications screen (no longer a bottom tab).
          _iconCircle(Icons.notifications_none_rounded,
              () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const NotificationsTab())),),
          const SizedBox(width: 5),
          // Support-agent avatar → customer support page.
          GestureDetector(
            onTap: () =>
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SupportScreen())),
            child: Container(
              width: 36,
              height: 36,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: Ob.border),
                boxShadow: Ob.softShadow,
              ),
              child: Image.asset('assets/onboarding/support_avatar.webp', fit: BoxFit.cover),
            ),
          ),
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
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: Colors.white,
            shape: BoxShape.circle,
            border: Border.all(color: Ob.border),
            boxShadow: Ob.softShadow,
          ),
          child: Icon(icon, size: 17, color: Ob.navy),
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
              () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const HoroscopeScreen())),),
          _tool(context, 'assets/onboarding/tool_match.png', 'Kundali\nMatch',
              () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const KundaliMatchScreen())),),
          _tool(context, 'assets/onboarding/tool_kundali.png', 'Janam\nKundali',
              () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const JanamKundliScreen())),),
          _tool(context, 'assets/onboarding/tool_free.png', 'Free\nServices',
              () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const FreeServicesScreen())),),
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
              gradient: const LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFFFFFDF6), Colors.white],
              ),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFFE7B84B).withValues(alpha: 0.55), width: 1.2),
              boxShadow: Ob.softShadow,
            ),
            child: Column(
              children: [
                // fit: contain keeps every icon the same visual size (a
                // non-square asset was stretching without it).
                SizedBox(
                  height: 44,
                  child: Image.asset(asset, width: 44, height: 44, fit: BoxFit.contain),
                ),
                const SizedBox(height: 8),
                Text(label,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Ob.note.copyWith(color: Ob.navy, fontWeight: FontWeight.w600, height: 1.2, fontSize: 11.5),),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// -------------------------------------------------------------- banners --
class _HomeBanners extends ConsumerStatefulWidget {
  const _HomeBanners();
  @override
  ConsumerState<_HomeBanners> createState() => _HomeBannersState();
}

class _HomeBannersState extends ConsumerState<_HomeBanners> {
  // Full-width banners (no centered peek) so the strip fills to both edges.
  final _controller = PageController(viewportFraction: 1);
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Live admin-managed banners appear first, then the evergreen defaults.
    final live = ref.watch(_homeBannersProvider).valueOrNull ?? const <PromoBanner>[];
    final banners = <Widget>[
      // Live admin-managed banners can advertise the Mall / recharge (e.g. the
      // "Shop Now · Rudraksh" store banner), so they're hidden in the free v1.
      if (kMonetizationEnabled)
        for (final b in live) _liveBanner(context, b),
      _banner(
        gradient: _grad(const [Color(0xFF9E7BE0), Color(0xFF7E57C2), Color(0xFF5E3FBE)]),
        kicker: '✦ WELCOME GIFT',
        title: 'Start Your Free\nSession',
        subtitle: 'Your first chat is on us',
        cta: 'Start Now',
        illustration: Image.asset(Ob.gift, height: 98),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SearchScreen())),
      ),
      // ... hidden in free v1 (advertises a paid booking)
      if (kMonetizationEnabled)
        _banner(
          gradient: _grad(const [Color(0xFF6A47C7), Color(0xFF432B85), Color(0xFF2C1E5C)]),
          kicker: '✦ DIVINE BLESSINGS',
          title: 'Book Group\nPujas',
          subtitle: 'By verified pandits',
          cta: 'Book Now',
          illustration: Padding(
            padding: const EdgeInsets.only(right: 6, bottom: 2),
            child: Image.asset(Ob.pujaMandala, height: 108),
          ),
          onTap: () => _comingSoon(context, 'Group Pujas'),
        ),
      _trustBanner(),
    ];
    return Column(
      children: [
        SizedBox(
          height: 120,
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

  // A live admin-managed banner (image + colours + copy + CTA from the portal).
  Widget _liveBanner(BuildContext context, PromoBanner b) {
    final bg = _hex(b.bgColor) ?? const Color(0xFF6A47C7);
    final fg = _hex(b.textColor) ?? Colors.white;
    final hasImg = b.image.isNotEmpty;

    // Themed banner: draw the chosen celestial theme (unless a custom photo was
    // uploaded, which takes over the whole strip).
    final th = promoThemeById(b.theme);
    if (th != null && !hasImg) {
      final isSplit = th.layout == PromoLayout.split;
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: GestureDetector(
          onTap: () => _openBanner(context, b),
          child: PromoSurface(
            theme: th,
            variant: PromoVariant.card,
            radius: 24,
            child: SizedBox.expand(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
                child: Row(
                  children: [
                    Expanded(flex: isSplit ? 62 : 100, child: _bannerCopy(b, th)),
                    if (isSplit) const Expanded(flex: 38, child: SizedBox()),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: GestureDetector(
        onTap: () => _openBanner(context, b),
        child: Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: bg,
            gradient: hasImg ? null : _grad([bg, _darken(bg)]),
            borderRadius: BorderRadius.circular(24),
            boxShadow: _bshadow,
          ),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (hasImg)
                CachedNetworkImage(imageUrl: b.image, fit: BoxFit.cover,
                    memCacheWidth: 1080,
                    fadeInDuration: const Duration(milliseconds: 180),
                    errorWidget: (_, __, ___) => const SizedBox.shrink(),),
              if (hasImg)
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.centerLeft,
                      end: Alignment.centerRight,
                      colors: [Color(0xCC000000), Color(0x22000000)],
                    ),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
                child: Column(
                  crossAxisAlignment: b.textAlign == 'center' ? CrossAxisAlignment.center : CrossAxisAlignment.start,
                  mainAxisAlignment: b.textPosition == 'top'
                      ? MainAxisAlignment.start
                      : b.textPosition == 'bottom'
                          ? MainAxisAlignment.end
                          : MainAxisAlignment.center,
                  children: [
                    if (b.title.isNotEmpty)
                      SizedBox(
                        width: b.textAlign == 'center' ? double.infinity : 210,
                        child: Text(b.title,
                            maxLines: 2,
                            textAlign: b.textAlign == 'center' ? TextAlign.center : TextAlign.start,
                            overflow: TextOverflow.ellipsis,
                            style: Ob.title.copyWith(color: fg, fontSize: (22 * b.headlineScale).clamp(13.0, 34.0).toDouble(), height: 1.1),),
                      ),
                    if (b.subtitle.isNotEmpty) ...[
                      const SizedBox(height: 5),
                      SizedBox(
                        width: b.textAlign == 'center' ? double.infinity : 210,
                        child: Text(b.subtitle,
                            maxLines: 2,
                            textAlign: b.textAlign == 'center' ? TextAlign.center : TextAlign.start,
                            overflow: TextOverflow.ellipsis,
                            style: Ob.note.copyWith(color: fg.withValues(alpha: 0.92)),),
                      ),
                    ],
                    if ((b.cta ?? '').isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(13)),
                        child: Text('${b.cta}  →',
                            style: Ob.option.copyWith(fontSize: 12.5, fontWeight: FontWeight.w700, color: bg),),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // Themed-banner copy: title + subtitle + CTA using the theme's colours.
  Widget _bannerCopy(PromoBanner b, PromoTheme th) {
    final fg = th.tx;
    final head = promoHeadline(th); // gold on dark grounds, theme text on light
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (b.title.isNotEmpty)
          Text(b.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Ob.title.copyWith(color: head, fontSize: 22, height: 1.1),),
        if (b.subtitle.isNotEmpty) ...[
          const SizedBox(height: 5),
          Text(b.subtitle,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Ob.note.copyWith(color: fg.withValues(alpha: 0.92)),),
        ],
        if ((b.cta ?? '').isNotEmpty) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(gradient: promoAccent(th), borderRadius: BorderRadius.circular(13)),
            child: Text('${b.cta}  →',
                style: Ob.option.copyWith(fontSize: 12.5, fontWeight: FontWeight.w700, color: th.accentTx ?? Ob.navy),),
          ),
        ],
      ],
    );
  }

  // Tap a banner. Half/full themed banners open the shared promo popup (its
  // landing view); the button then follows the deeplink. Small banners (or
  // un-themed ones) just follow the deeplink straight away.
  void _openBanner(BuildContext context, PromoBanner b) {
    final th = promoThemeById(b.theme);
    // The landing hero uses the uploaded portrait (9:16) when present, else the
    // strip image — without this the popup always fell back to the gift art.
    final hasPortrait = b.portraitImage?.trim().isNotEmpty ?? false;
    final landingImage = hasPortrait ? b.portraitImage!.trim() : (b.image.isNotEmpty ? b.image : null);
    final fill = b.imageFillsSheet && landingImage != null;
    // Image-first fill works even with no theme (the image carries the design).
    if (b.hasLanding && (th != null || fill)) {
      showPromoPopup(
        context,
        theme: th,
        displayMode: b.displayMode,
        title: (b.landingTitle?.trim().isNotEmpty ?? false) ? b.landingTitle!.trim() : b.title,
        body: (b.landingBody?.trim().isNotEmpty ?? false) ? b.landingBody!.trim() : b.subtitle,
        ctaLabel: (b.cta?.trim().isNotEmpty ?? false) ? b.cta!.trim() : 'View offer',
        imageUrl: landingImage,
        imageStyle: hasPortrait ? 'portrait' : 'banner',
        imageFill: fill,
        heroKicker: '✦  JUST FOR YOU',
        heroTagline: null,
        onAction: () => _followDeeplink(context, b.deeplink),
      );
      return;
    }
    _followDeeplink(context, b.deeplink);
  }

  void _followDeeplink(BuildContext context, String? dl) {
    if (dl == null || dl.isEmpty) return;
    if (dl.startsWith('/')) {
      context.push(dl);
    } else if (dl.startsWith('asktro://')) {
      context.push('/${dl.substring('asktro://'.length)}');
    }
  }

  Color? _hex(String? s) {
    if (s == null || s.isEmpty) return null;
    var h = s.replaceFirst('#', '').trim();
    if (h.length == 6) h = 'FF$h';
    if (h.length != 8) return null;
    final v = int.tryParse(h, radix: 16);
    return v == null ? null : Color(v);
  }

  Color _darken(Color c, [double amt = 0.18]) {
    final h = HSLColor.fromColor(c);
    return h.withLightness((h.lightness - amt).clamp(0.0, 1.0)).toColor();
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
    // Compact promo strip (~120px): kicker + one-line title + inline CTA on the
    // left, a small illustration bleeding off the right. Subtitle is dropped at
    // this height to keep the strip clean.
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          clipBehavior: Clip.antiAlias,
          padding: const EdgeInsets.fromLTRB(16, 12, 14, 12),
          decoration: BoxDecoration(gradient: gradient, borderRadius: BorderRadius.circular(20), boxShadow: _bshadow),
          child: Stack(
            children: [
              // Soft gold halo behind the illustration.
              Positioned(
                right: -30,
                bottom: -40,
                child: IgnorePointer(
                  child: Container(
                    width: 150,
                    height: 150,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        colors: [Color(0x66EAD079), Color(0x1FEAD079), Color(0x00EAD079)],
                        stops: [0.0, 0.55, 1.0],
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(right: -4, bottom: -8, child: illustration),
              const Positioned(
                  right: 34, top: 8,
                  child: IgnorePointer(child: Icon(Icons.auto_awesome, color: Color(0xCCF3D97C), size: 12)),),
              const Positioned(
                  right: 14, top: 44,
                  child: IgnorePointer(child: Icon(Icons.auto_awesome, color: Color(0x99F3D97C), size: 9)),),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(kicker,
                      style: Ob.note.copyWith(
                          color: const Color(0xFFEAD79A), letterSpacing: 1.3, fontWeight: FontWeight.w600, fontSize: 9.5,),),
                  const SizedBox(height: 5),
                  SizedBox(
                    width: 190,
                    child: Text(title.replaceAll('\n', ' '),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Ob.title.copyWith(color: Colors.white, fontSize: 18, height: 1.05),),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(gradient: Ob.goldGradient, borderRadius: BorderRadius.circular(12)),
                    child: Text('$cta  →',
                        style: Ob.option.copyWith(fontSize: 11.5, fontWeight: FontWeight.w600, color: Ob.navy),),
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
            boxShadow: _bshadow,),
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
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('Why millions trust us', style: Ob.title.copyWith(color: Colors.white, fontSize: 15)),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      // ... 'Money-back' hidden in free v1 — swapped for a non-money trust item
                      kMonetizationEnabled
                          ? _trustItem(Icons.verified_user_rounded, 'Money-back')
                          : _trustItem(Icons.shield_rounded, 'Private & Secure'),
                      _trustItem(Icons.workspace_premium_rounded, 'Verified experts'),
                      _trustItem(Icons.lock_rounded, '100% private'),
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
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Colors.white.withValues(alpha: 0.14), Colors.white.withValues(alpha: 0.05)],
                ),
                shape: BoxShape.circle,
                border: Border.all(color: Ob.gold.withValues(alpha: 0.55), width: 1.1),
              ),
              child: Icon(icon, color: const Color(0xFFF3D97C), size: 15),
            ),
            const SizedBox(width: 6),
            Flexible(
              child: Text(label,
                  maxLines: 2,
                  style: Ob.note.copyWith(color: Colors.white, fontSize: 9.5, height: 1.1, fontWeight: FontWeight.w600),),
            ),
          ],
        ),
      );
}

// ---------------------------------------------------------------- rails --
// -------------------------------------------- astrologer carousel (2-up) --
/// A horizontal, gently auto-advancing rail of celestial astrologer cards
/// (~2 visible). A "View all" opens the full astrologer directory.
class _AstroCarousel extends ConsumerStatefulWidget {
  const _AstroCarousel({
    required this.title,
    required this.provider,
    this.onlyRisingStars = false,
    this.hideWhenEmpty = false,
    this.titleBadge,
  });
  final String title;
  final AutoDisposeStreamProvider<List<Astrologer>> provider;
  // Optional badge shown before the rail title (e.g. the green verified check on
  // "Asktro Verified Astrologers"). Falls back to the gold sparkle.
  final Widget? titleBadge;
  // "View all" from Rising Stars opens the tagged-only directory; from Top
  // Astrologers it opens the full directory.
  final bool onlyRisingStars;
  // When true, the whole rail (header included) renders nothing while its list
  // is empty — so the "Real astrologers" section simply doesn't appear until
  // real humans exist, instead of showing an empty "none yet" placeholder.
  final bool hideWhenEmpty;

  @override
  ConsumerState<_AstroCarousel> createState() => _AstroCarouselState();
}

class _AstroCarouselState extends ConsumerState<_AstroCarousel> {
  // viewportFraction < 0.5 peeks the next card so it reads as swipeable; the
  // user scrolls at their own pace (no auto-advance).
  final _pc = PageController(viewportFraction: 0.46);

  @override
  void dispose() {
    _pc.dispose();
    super.dispose();
  }

  void _viewAll() => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => SearchScreen(
          title: widget.onlyRisingStars ? 'Rising Stars' : 'All Astrologers',
          onlyRisingStars: widget.onlyRisingStars,
        ),
      ),);

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(widget.provider);
    // An auto-hiding rail (e.g. "Talk to a Real Astrologer") shows nothing at all
    // — not even its header — until it actually has astrologers to display.
    if (widget.hideWhenEmpty) {
      final data = async.valueOrNull;
      if (data == null || data.isEmpty) return const SizedBox.shrink();
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 22, 12, 10),
          child: Row(
            children: [
              widget.titleBadge ?? const Icon(Icons.auto_awesome, size: 17, color: Ob.gold),
              const SizedBox(width: 7),
              Expanded(child: Text(widget.title, style: Ob.title.copyWith(fontSize: 20))),
              GestureDetector(
                onTap: _viewAll,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  child: Text('View all  →',
                      style: Ob.option.copyWith(color: Ob.purple, fontWeight: FontWeight.w700, fontSize: 13),),
                ),
              ),
            ],
          ),
        ),
        async.when(
          loading: () => const SizedBox(
            height: 214,
            child: Center(child: CircularProgressIndicator(color: Ob.purple)),
          ),
          error: (_, __) => Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Text('Could not load ${widget.title}', style: Ob.note),
          ),
          data: (list) {
            if (list.isEmpty) {
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Text('No astrologers here yet.', style: Ob.note),
              );
            }
            return SizedBox(
              height: 214,
              child: PageView.builder(
                controller: _pc,
                padEnds: false,
                itemCount: list.length,
                itemBuilder: (_, i) => Padding(
                  padding: EdgeInsets.only(left: i == 0 ? 12 : 6, right: 6, bottom: 6),
                  child: _CelestialAstroCard(a: list[i]),
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}

/// Celestial directory card — flowing colour banner, gold-ringed portrait, and
/// the key stats. Tapping opens the full profile.
class _CelestialAstroCard extends StatelessWidget {
  const _CelestialAstroCard({required this.a});
  final Astrologer a;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/astrologer/${a.id}'),
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0xFFE7B84B).withValues(alpha: 0.5), width: 1.1),
          boxShadow: Ob.softShadow,
        ),
        child: Column(
          children: [
            // Flowing celestial banner with the portrait straddling its edge.
            SizedBox(
              height: 82,
              child: Stack(
                alignment: Alignment.topCenter,
                children: [
                  Container(
                    height: 50,
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFF8A63D2), Color(0xFFB56B9A), Color(0xFFE8A24C)],
                      ),
                    ),
                  ),
                  Positioned(
                    top: 22,
                    child: Container(
                      padding: const EdgeInsets.all(2.5),
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(colors: [Color(0xFFEAD079), Color(0xFFD4AF37)]),
                      ),
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          AppAvatar(name: a.name, photoUrl: a.profilePhoto, size: 54),
                          if (a.isOnline)
                            Positioned(
                              right: 1,
                              bottom: 1,
                              child: Container(
                                width: 12,
                                height: 12,
                                decoration: BoxDecoration(
                                  color: AppColors.online,
                                  shape: BoxShape.circle,
                                  border: Border.all(color: Colors.white, width: 2),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Flexible(
                    child: Text(a.name,
                        style: Ob.title.copyWith(fontSize: 14.5),
                        overflow: TextOverflow.ellipsis, textAlign: TextAlign.center,),
                  ),
                  if (a.verified && !a.isAI) ...[const SizedBox(width: 3), const VerifiedBadge(size: 13)],
                ],
              ),
            ),
            const SizedBox(height: 2),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: Text(a.expertise.take(2).join(' • '),
                  style: Ob.note.copyWith(color: Ob.navy.withValues(alpha: 0.7), fontSize: 11.5),
                  maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center,),
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.star_rounded, size: 14, color: Ob.gold),
                const SizedBox(width: 2),
                Text(a.rating.toStringAsFixed(1),
                    style: Ob.option.copyWith(fontSize: 12, fontWeight: FontWeight.w700),),
                const SizedBox(width: 7),
                Text('${a.experience}y exp',
                    style: Ob.note.copyWith(fontSize: 11.5, color: Ob.navy.withValues(alpha: 0.6)),),
              ],
            ),
            const Spacer(),
            // Per-minute rate only for PAID (human) astrologers — AI is free.
            if (kMonetizationEnabled && !a.isAI)
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 5),
                decoration: BoxDecoration(color: Ob.lavenderChip, borderRadius: BorderRadius.circular(999)),
                child: Text(a.rateLabel,
                    style: Ob.option.copyWith(color: Ob.purple, fontWeight: FontWeight.w800, fontSize: 12.5),),
              ),
          ],
        ),
      ),
    );
  }
}
