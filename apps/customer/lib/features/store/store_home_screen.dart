import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'store_models.dart';
import 'store_providers.dart';
import 'store_theme.dart';
import 'store_widgets.dart';

/// The ground a section "band" sits on. Cream/white/ghee-gold give the
/// storefront a warm rhythm so each section reads as its own zone; the glowing
/// ghee-gold band spotlights the featured rails (Best Sellers, Combo Deals).
enum _Ground { white, cream, gold }

/// Asktro Mall — the storefront. A warm boutique: blended header, a full-bleed
/// hero image, category chips, an auto-scrolling claim strip, Best Sellers, New
/// Launches, and the full All-Products grid. Reached from the home rail's "Visit
/// Store" and the bottom-nav Mall tab.
class StoreHomeScreen extends ConsumerWidget {
  const StoreHomeScreen({super.key, this.embedded = false});

  /// When shown inside the bottom-nav tab there is no back arrow.
  final bool embedded;

  static const _claims = ['Energised by top astrologers', '100% Natural', 'Lab Certified', 'Free shipping over ₹499'];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Only top-level categories head the storefront; subcategories appear when
    // you open a parent category.
    final cats = ref.watch(storeRootCategoriesProvider);
    final products = ref.watch(storeAllProductsProvider).valueOrNull ?? const [];

    final best = products.where((p) => p.bestSeller).toList();
    final bestSellers = (best.isEmpty ? products.take(8).toList() : best);
    final newLaunches = products.where((p) => p.newLaunch).toList();
    final combos = products.where((p) => p.combo).toList();

    final testimonials = ref.watch(storeTestimonialsProvider).valueOrNull ?? const [];
    final videos = ref.watch(storeVideosProvider).valueOrNull ?? const [];
    final faqs = ref.watch(storeFaqsProvider).valueOrNull ?? const [];

    // Claim-strip phrases are portal-editable; fall back to the built-in set.
    final customClaims = ref.watch(storeClaimsProvider).valueOrNull ?? const <String>[];
    final claims = customClaims.isNotEmpty ? customClaims : _claims;

    return Scaffold(
      backgroundColor: const Color(0xFFFBF5E9),
      body: SafeArea(
        bottom: false,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(child: _Header(embedded: embedded)),
            SliverToBoxAdapter(child: _Chips(cats: cats)),
            const SliverToBoxAdapter(child: _Hero()),
            SliverToBoxAdapter(child: ClaimMarquee(phrases: claims)),
            const SliverToBoxAdapter(child: SizedBox(height: 10)),
            if (bestSellers.isNotEmpty)
              SliverToBoxAdapter(
                child: _railBand(context, ref, 'Most Loved', 'Best Sellers', bestSellers,
                    ground: _Ground.gold, onViewAll: () => context.push('/store/products/best'),),
              ),
            if (newLaunches.isNotEmpty)
              SliverToBoxAdapter(
                child: _railBand(context, ref, 'Just In', 'New Launches', newLaunches,
                    ribbon: (text: 'NEW', color: Mall.green),
                    onViewAll: () => context.push('/store/products/new'),),
              ),
            if (combos.isNotEmpty)
              SliverToBoxAdapter(
                child: _railBand(context, ref, 'Save More', 'Combo Deals', combos,
                    ribbon: (text: 'COMBO', color: Mall.offInk), ground: _Ground.gold,
                    onViewAll: () => context.push('/store/products/combo'),),
              ),
            if (cats.isNotEmpty)
              SliverToBoxAdapter(child: _categoryBand(context, cats)),
            if (products.isEmpty)
              const SliverToBoxAdapter(child: _Empty())
            else
              SliverToBoxAdapter(
                child: _allProductsBand(context, ref, products.take(8).toList(), products.length),
              ),
            if (testimonials.isNotEmpty)
              SliverToBoxAdapter(child: _testimonialBand(testimonials)),
            if (videos.isNotEmpty)
              SliverToBoxAdapter(child: _videoBand(context, videos)),
            if (faqs.isNotEmpty)
              SliverToBoxAdapter(child: _faqBand(faqs)),
            const SliverToBoxAdapter(child: SizedBox(height: 22)),
          ],
        ),
      ),
    );
  }

  Widget _rail(BuildContext context, WidgetRef ref, List<StoreProduct> items, {({String text, Color color})? ribbon}) {
    return SizedBox(
      height: 280,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(12, 2, 12, 10),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) => SizedBox(width: 152, child: _card(context, ref, items[i], ribbon: ribbon)),
      ),
    );
  }

  Widget _card(BuildContext context, WidgetRef ref, StoreProduct p, {({String text, Color color})? ribbon}) => ProductCard(
        product: p,
        ribbon: ribbon,
        onTap: () => context.push('/store/product/${p.id}', extra: p),
        onAdd: () {
          ref.read(cartProvider.notifier).add(p);
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(const SnackBar(
              content: Text('Added to cart'),
              duration: Duration(milliseconds: 1100),
              behavior: SnackBarBehavior.floating,
            ),);
        },
      );

  static Widget _sectionHeader(String eyebrow, String title, {VoidCallback? onViewAll}) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 4, 14, 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          const Padding(padding: EdgeInsets.only(bottom: 3), child: Icon(Icons.auto_awesome, size: 13, color: Mall.gold)),
          const SizedBox(width: 7),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(eyebrow.toUpperCase(),
                    style: const TextStyle(fontSize: 9, letterSpacing: 1.8, fontWeight: FontWeight.w700, color: Mall.goldInk),),
                const SizedBox(height: 2),
                Text(title,
                    style: const TextStyle(fontFamily: 'serif', fontSize: 21, fontWeight: FontWeight.w700, color: Mall.titleBrown, height: 1),),
              ],
            ),
          ),
          if (onViewAll != null)
            GestureDetector(
              onTap: onViewAll,
              behavior: HitTestBehavior.opaque,
              child: const Padding(
                padding: EdgeInsets.only(bottom: 2, left: 8),
                child: Text('View all ›', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: Mall.goldInk)),
              ),
            ),
        ],
      ),
    );
  }

  // ---- section "bands": a full-bleed white block on the warm ground, split
  // by a cream gap + hairlines, so each section reads as its own zone. ----

  static Widget _band(Widget child, {_Ground ground = _Ground.white}) {
    const BoxDecoration white = BoxDecoration(
      color: Colors.white,
      border: Border(top: BorderSide(color: Mall.hair), bottom: BorderSide(color: Mall.hair)),
    );
    const BoxDecoration cream = BoxDecoration(
      color: Color(0xFFFBF5E9),
      border: Border(top: BorderSide(color: Color(0xFFEADDBF)), bottom: BorderSide(color: Color(0xFFEADDBF))),
    );
    const BoxDecoration gold = BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFFFDF4DD), Color(0xFFF7E7B7), Color(0xFFF0D691)],
        stops: [0, 0.55, 1],
      ),
      border: Border(top: BorderSide(color: Color(0xFFE7CD8A)), bottom: BorderSide(color: Color(0xFFE7CD8A))),
    );
    final deco = switch (ground) {
      _Ground.white => white,
      _Ground.cream => cream,
      _Ground.gold => gold,
    };
    // The featured (gold) band carries a faint ✦ watermark top-right.
    final content = ground == _Ground.gold
        ? Stack(
            children: [
              const Positioned(
                right: 14,
                top: 4,
                child: IgnorePointer(
                  child: Text('✦', style: TextStyle(fontSize: 58, color: Color(0x47E7C878), height: 1)),
                ),
              ),
              child,
            ],
          )
        : child;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 10),
      decoration: deco,
      padding: const EdgeInsets.only(top: 14, bottom: 14),
      child: content,
    );
  }

  Widget _railBand(BuildContext context, WidgetRef ref, String eyebrow, String title, List<StoreProduct> items,
      {({String text, Color color})? ribbon, VoidCallback? onViewAll, _Ground ground = _Ground.white,}) {
    return _band(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _sectionHeader(eyebrow, title, onViewAll: onViewAll),
          _rail(context, ref, items, ribbon: ribbon),
        ],
      ),
      ground: ground,
    );
  }

  Widget _categoryBand(BuildContext context, List<StoreCategory> cats) {
    return _band(Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _sectionHeader('Find your fit', 'Shop by Category'),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 2, 14, 0),
          child: GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: EdgeInsets.zero,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 0.82,
            ),
            itemCount: cats.length,
            itemBuilder: (_, i) => StoreCategoryCard(
              category: cats[i],
              onTap: () => context.push('/store/category/${cats[i].id}', extra: cats[i].name),
            ),
          ),
        ),
      ],
    ), ground: _Ground.cream,);
  }

  Widget _allProductsBand(BuildContext context, WidgetRef ref, List<StoreProduct> preview, int total) {
    return _band(Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _sectionHeader('Browse our collection', 'All Products',
            onViewAll: () => context.push('/store/products/all'),),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 2, 14, 6),
          child: GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: EdgeInsets.zero,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 0.58,
            ),
            itemCount: preview.length,
            itemBuilder: (_, i) => _card(context, ref, preview[i]),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 6, 14, 0),
          child: GestureDetector(
            onTap: () => context.push('/store/products/all'),
            child: Container(
              height: 46,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Mall.cream,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Mall.goldLine, width: 1.4),
              ),
              child: Text('View all $total products  →',
                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Mall.goldInk),),
            ),
          ),
        ),
      ],
    ),);
  }

  Widget _testimonialBand(List<StoreTestimonial> items) {
    return _band(Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _sectionHeader('In their words', 'What Our Customers Say'),
        SizedBox(
          height: 176,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(14, 2, 14, 0),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) => TestimonialCard(t: items[i]),
          ),
        ),
      ],
    ), ground: _Ground.cream,);
  }

  Widget _videoBand(BuildContext context, List<StoreVideo> items) {
    return _band(Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _sectionHeader('Watch & learn', 'Guides & Stories'),
        SizedBox(
          height: 200,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(14, 2, 14, 0),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) => VideoCard(
              video: items[i],
              onTap: () => ScaffoldMessenger.of(context)
                ..hideCurrentSnackBar()
                ..showSnackBar(const SnackBar(
                  content: Text('Video player coming soon'),
                  duration: Duration(milliseconds: 1100),
                  behavior: SnackBarBehavior.floating,
                ),),
            ),
          ),
        ),
      ],
    ),);
  }

  Widget _faqBand(List<StoreFaq> items) {
    return _band(Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _sectionHeader('Good to know', 'Frequently Asked'),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 2, 14, 0),
          child: Column(children: [for (final f in items) FaqTile(faq: f)]),
        ),
      ],
    ), ground: _Ground.cream,);
  }
}

/// Blended store header (no white bar) — sits on the warm ground.
class _Header extends ConsumerWidget {
  const _Header({required this.embedded});
  final bool embedded;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(cartCountProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(6, 4, 12, 8),
      child: Row(
        children: [
          if (!embedded)
            IconButton(icon: const Icon(Icons.arrow_back, color: Mall.titleBrown), onPressed: () => context.pop())
          else
            const SizedBox(width: 12),
          const Expanded(
            child: Text('Asktro Mall',
                style: TextStyle(fontFamily: 'serif', fontSize: 24, fontWeight: FontWeight.w700, color: Mall.titleBrown, letterSpacing: 0.3),),
          ),
          IconButton(icon: const Icon(Icons.search_rounded, color: Mall.goldInk), onPressed: () => context.push('/store/search')),
          Stack(
            clipBehavior: Clip.none,
            children: [
              IconButton(icon: const Icon(Icons.shopping_cart_outlined, color: Mall.goldInk), onPressed: () => context.push('/store/cart')),
              if (count > 0)
                Positioned(
                  right: 4, top: 4,
                  child: Container(
                    padding: const EdgeInsets.all(3),
                    decoration: const BoxDecoration(color: Mall.deep, shape: BoxShape.circle),
                    constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                    child: Text('$count', textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold)),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Chips extends StatelessWidget {
  const _Chips({required this.cats});
  final List<StoreCategory> cats;
  @override
  Widget build(BuildContext context) {
    if (cats.isEmpty) return const SizedBox(height: 4);
    return SizedBox(
      height: 92,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(12, 2, 12, 8),
        itemCount: cats.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) => CategoryTile(
          category: cats[i],
          size: 60,
          onTap: () => context.push('/store/category/${cats[i].id}', extra: cats[i].name),
        ),
      ),
    );
  }
}

/// Full-bleed hero. For now it uses the bundled welcoming-pandit art on a warm
/// gold ground; admin-uploaded store banners replace this once the back-office
/// ships.
/// The storefront hero: an admin-managed banner carousel when banners exist,
/// otherwise the bundled "Blessed by our Pandits" art.
class _Hero extends ConsumerWidget {
  const _Hero();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final banners = ref.watch(storeBannersProvider).valueOrNull ?? const [];
    if (banners.isEmpty) return const _PanditHero();
    return _BannerCarousel(banners: banners);
  }
}

class _PanditHero extends StatelessWidget {
  const _PanditHero();
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 320,
      width: double.infinity,
      child: Stack(
        fit: StackFit.expand,
        children: [
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: Alignment(0.45, -0.55), radius: 1.2,
                colors: [Color(0xFFF0D78F), Color(0xFFC88F2E), Color(0xFF7A4B12)],
                stops: [0, 0.5, 1],
              ),
            ),
          ),
          Align(
            alignment: Alignment.bottomRight,
            child: Padding(
              padding: const EdgeInsets.only(right: 4),
              child: Image.asset('assets/promo/welcome.png', height: 316, fit: BoxFit.fitHeight),
            ),
          ),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.centerLeft, end: Alignment.centerRight,
                colors: [Color(0xB01E1204), Color(0x201E1204), Color(0x00000000)],
                stops: [0, 0.55, 1],
              ),
            ),
          ),
          Positioned(
            left: 18, top: 0, bottom: 0, width: 190,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('✦ THE ASKTRO PROMISE',
                    style: TextStyle(fontSize: 8.5, letterSpacing: 1.6, fontWeight: FontWeight.w700, color: Color(0xFFF6D98A)),),
                const SizedBox(height: 5),
                const Text('Blessed by\nour Pandits',
                    style: TextStyle(fontFamily: 'serif', fontSize: 25, fontWeight: FontWeight.w700, color: Colors.white, height: 1.05),),
                const SizedBox(height: 8),
                const SizedBox(
                  width: 168,
                  child: Text('Energised & lab-certified, chosen for your stars.',
                      style: TextStyle(fontSize: 10.5, height: 1.35, color: Color(0xFFFBEECB), fontWeight: FontWeight.w500),),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 8),
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xFFF4D281), Color(0xFFDCA63E)]), borderRadius: BorderRadius.circular(18)),
                  child: const Text('Shop the collection', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF4A3208))),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Full-bleed auto-shuffling hero banners (admin-uploaded). Tapping a banner
/// opens its linked category when set.
class _BannerCarousel extends StatefulWidget {
  const _BannerCarousel({required this.banners});
  final List<StoreBanner> banners;

  @override
  State<_BannerCarousel> createState() => _BannerCarouselState();
}

class _BannerCarouselState extends State<_BannerCarousel> {
  final _pc = PageController();
  Timer? _timer;
  int _i = 0;

  @override
  void initState() {
    super.initState();
    if (widget.banners.length > 1) {
      _timer = Timer.periodic(const Duration(seconds: 4), (_) {
        if (!mounted) return;
        _i = (_i + 1) % widget.banners.length;
        _pc.animateToPage(_i, duration: const Duration(milliseconds: 450), curve: Curves.easeInOut);
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // 5:4 — a taller hero, and the exact frame the admin crops banners to, so
    // what they frame in the portal is precisely what shows here (no clipping).
    return AspectRatio(
      aspectRatio: 5 / 4,
      child: Stack(
        children: [
          PageView.builder(
            controller: _pc,
            onPageChanged: (i) => setState(() => _i = i),
            itemCount: widget.banners.length,
            itemBuilder: (_, i) => _tile(context, widget.banners[i]),
          ),
          if (widget.banners.length > 1)
            Positioned(
              left: 18,
              bottom: 14,
              child: Row(
                children: List.generate(widget.banners.length, (i) {
                  final on = i == _i;
                  return AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.only(right: 5),
                    width: on ? 18 : 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: on ? const Color(0xFFF6D98A) : Colors.white54,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  );
                }),
              ),
            ),
        ],
      ),
    );
  }

  Widget _tile(BuildContext context, StoreBanner b) {
    return GestureDetector(
      onTap: b.linkCategoryId.isEmpty ? null : () => context.push('/store/category/${b.linkCategoryId}'),
      child: Stack(
        fit: StackFit.expand,
        children: [
          MallImage(url: b.image, size: 60, radius: 0, fit: BoxFit.cover),
          if (b.headline.isNotEmpty || b.subtext.isNotEmpty || b.ctaLabel.isNotEmpty)
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.centerLeft, end: Alignment.centerRight,
                  colors: [Color(0xB01E1204), Color(0x201E1204), Color(0x00000000)],
                  stops: [0, 0.55, 1],
                ),
              ),
            ),
          if (b.headline.isNotEmpty || b.subtext.isNotEmpty || b.ctaLabel.isNotEmpty)
            Positioned(
              left: 18, top: 0, bottom: 0, width: 210,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (b.headline.isNotEmpty)
                    Text(b.headline,
                        style: const TextStyle(fontFamily: 'serif', fontSize: 25, fontWeight: FontWeight.w700, color: Colors.white, height: 1.05),),
                  if (b.subtext.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(b.subtext, style: const TextStyle(fontSize: 11, height: 1.35, color: Color(0xFFFBEECB), fontWeight: FontWeight.w500)),
                  ],
                  if (b.ctaLabel.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 8),
                      decoration: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xFFF4D281), Color(0xFFDCA63E)]), borderRadius: BorderRadius.circular(18)),
                      child: Text(b.ctaLabel, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF4A3208))),
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();
  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.fromLTRB(24, 40, 24, 40),
      child: Column(
        children: [
          Icon(Icons.storefront_outlined, size: 46, color: Mall.deep),
          SizedBox(height: 12),
          Text('The store is being stocked', style: TextStyle(fontWeight: FontWeight.w700, color: Mall.navy)),
          SizedBox(height: 4),
          Text('Check back soon for blessed products.', style: TextStyle(color: Mall.warmGrey, fontSize: 13)),
        ],
      ),
    );
  }
}

/// Shared gold-accented store app bar with a cart button + badge. Used by the
/// store sub-screens (category, detail, cart, orders).
class MallAppBar extends ConsumerWidget implements PreferredSizeWidget {
  const MallAppBar({super.key, required this.title, this.automaticallyImplyLeading = true, this.showCart = true});
  final String title;
  final bool automaticallyImplyLeading;
  final bool showCart;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(cartCountProvider);
    return AppBar(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.white,
      elevation: 0.5,
      automaticallyImplyLeading: automaticallyImplyLeading,
      iconTheme: const IconThemeData(color: Mall.navy),
      title: Text(title,
          style: const TextStyle(fontFamily: 'serif', fontSize: 20, fontWeight: FontWeight.w700, color: Mall.ink),),
      actions: [
        if (showCart)
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                IconButton(
                  icon: const Icon(Icons.shopping_cart_outlined, color: Mall.goldInk),
                  onPressed: () => context.push('/store/cart'),
                ),
                if (count > 0)
                  Positioned(
                    right: 4, top: 4,
                    child: Container(
                      padding: const EdgeInsets.all(3),
                      decoration: const BoxDecoration(color: Mall.deep, shape: BoxShape.circle),
                      constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                      child: Text('$count',
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold),),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}
