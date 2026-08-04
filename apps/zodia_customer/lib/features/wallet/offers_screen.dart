import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../profile_setup/onboarding_style.dart';
import 'promo_popup.dart';
import 'promo_surface.dart';

final _couponsProvider = StreamProvider.autoDispose<List<Coupon>>(
    (ref) => ref.watch(catalogRepositoryProvider).watchCoupons(),);

/// Offer-type recharge plans (planType == 'offer'). These are "banner-only" on
/// the recharge screen; here on the Offers screen we surface them too, so an
/// offer plan created in the portal actually shows up for the user. Tapping one
/// opens its locked recharge checkout (/recharge?plan=<id>).
final _offerPlansProvider = StreamProvider.autoDispose<List<RechargePlan>>(
    (ref) => ref
        .watch(catalogRepositoryProvider)
        .watchPlans()
        .map((plans) => plans.where((p) => p.isOffer).toList()),);

/// Guards the app-open offer popup so it shows at most once per app launch.
final offerPopupShownProvider = StateProvider<bool>((ref) => false);

// ---- shared helpers ---------------------------------------------------------

Color _hex(String? s, Color fb) {
  if (s == null || s.isEmpty) return fb;
  var h = s.replaceFirst('#', '');
  if (h.length == 6) h = 'FF$h';
  final v = int.tryParse(h, radix: 16);
  return v == null ? fb : Color(v);
}

String _ttl(Coupon c) => c.title.isNotEmpty ? c.title : 'A gift for you 🎁';
String _bodyText(Coupon c) => c.description.isNotEmpty
    ? c.description
    : 'Get ${Money.formatPaise(c.amount)}${c.bonus > 0 ? ' + ${Money.formatPaise(c.bonus)} bonus' : ''} on your next recharge';

// ---- app-open popup ---------------------------------------------------------

/// Shown when the app opens (and reused as a preview). Renders the newest active
/// coupon through the shared promo popup, in the theme + display-mode the admin
/// picked. Tapping the button carries the code (and its locked amount) into
/// recharge.
Future<void> showOfferPopup(BuildContext context, Coupon coupon) {
  final th = promoThemeById(coupon.theme);
  final ctaLabel = (coupon.ctaText?.trim().isNotEmpty ?? false) ? coupon.ctaText!.trim() : 'Grab this offer';
  return showPromoPopup(
    context,
    theme: th,
    displayMode: coupon.displayMode,
    title: _ttl(coupon),
    body: _bodyText(coupon),
    code: coupon.code,
    ctaLabel: ctaLabel,
    medal: th?.medal ?? '🎁',
    onAction: () => context.push(
        '/recharge?coupon=${Uri.encodeComponent(coupon.code)}${coupon.amount > 0 ? '&lock=${coupon.amount}' : ''}',),
  );
}

// ---- Offers screen ----------------------------------------------------------

/// "Offers" — browse the active wallet coupons. Tapping one carries its code
/// into the recharge checkout (/recharge?coupon=<CODE>), where it's applied.
class OffersScreen extends ConsumerWidget {
  const OffersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final coupons = ref.watch(_couponsProvider);
    final offerPlans = ref.watch(_offerPlansProvider);
    final couponList = coupons.valueOrNull ?? const <Coupon>[];
    final planList = offerPlans.valueOrNull ?? const <RechargePlan>[];
    final anyLoading = coupons.isLoading || offerPlans.isLoading;
    final bothError = coupons.hasError && offerPlans.hasError;

    return Scaffold(
      backgroundColor: Ob.bgColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Ob.navy,
        title: Text('Offers', style: Ob.title.copyWith(fontSize: 22)),
      ),
      body: Builder(builder: (context) {
        if (couponList.isEmpty && planList.isEmpty) {
          if (anyLoading) return const Center(child: CircularProgressIndicator(color: Ob.purple));
          if (bothError) return const ErrorStateView();
          return const EmptyState(
            icon: Icons.local_offer_outlined,
            title: 'No offers right now',
            message: 'Check back soon — new offers drop regularly.',
          );
        }
        return ListView(
          padding: EdgeInsets.fromLTRB(20, 12, 20, 24 + MediaQuery.of(context).padding.bottom),
          children: [
            // Offer recharge plans first, then coupon tickets.
            for (final p in planList) Padding(padding: const EdgeInsets.only(bottom: 14), child: _OfferPlanCard(plan: p)),
            for (final c in couponList) Padding(padding: const EdgeInsets.only(bottom: 14), child: _OfferCard(coupon: c)),
          ],
        );
      },),
    );
  }
}

/// A tappable card for an offer-type recharge plan. Opens the recharge screen
/// locked to this exact plan (/recharge?plan=<id>), mirroring a recharge banner.
class _OfferPlanCard extends StatelessWidget {
  const _OfferPlanCard({required this.plan});
  final RechargePlan plan;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/recharge?plan=${Uri.encodeComponent(plan.id)}'),
      child: Container(
        decoration: BoxDecoration(color: Ob.purple, borderRadius: BorderRadius.circular(20), boxShadow: Ob.softShadow),
        padding: const EdgeInsets.all(18),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Recharge ${Money.formatPaise(plan.amount)}',
                      style: Ob.title.copyWith(color: Colors.white, fontSize: 19),),
                  const SizedBox(height: 6),
                  Text(
                    plan.bonus > 0
                        ? 'Add ${Money.formatPaise(plan.amount)} and get ${Money.formatPaise(plan.bonus)} bonus'
                        : 'A special recharge offer for you',
                    style: Ob.subtitle.copyWith(color: Colors.white.withValues(alpha: 0.9), fontSize: 13.5),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            if (plan.bonus > 0)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(gradient: Ob.goldGradient, borderRadius: BorderRadius.circular(12)),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('+${Money.formatPaise(plan.bonus)}', style: Ob.title.copyWith(color: Ob.navy, fontSize: 16)),
                    Text('bonus', style: Ob.option.copyWith(color: Ob.navy, fontSize: 10, fontWeight: FontWeight.w600)),
                  ],
                ),
              )
            else
              const Icon(Icons.chevron_right_rounded, color: Colors.white, size: 26),
          ],
        ),
      ),
    );
  }
}

class _OfferCard extends StatelessWidget {
  const _OfferCard({required this.coupon});
  final Coupon coupon;

  @override
  Widget build(BuildContext context) {
    final th = promoThemeById(coupon.theme);
    Future<Object?> onTap() => context.push(
        '/recharge?coupon=${Uri.encodeComponent(coupon.code)}${coupon.amount > 0 ? '&lock=${coupon.amount}' : ''}',);
    if (th != null) return _themed(context, th, onTap);

    // Fallback (no theme): the original solid-colour ticket.
    final bg = _hex(coupon.bgColor, Ob.purple);
    final fg = _hex(coupon.textColor, Colors.white);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20), boxShadow: Ob.softShadow),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: _textBlock(fg)),
                  const SizedBox(width: 12),
                  _rewardBadge(),
                ],
              ),
            ),
            _tearFooter(context, fg, Colors.white.withValues(alpha: 0.12)),
          ],
        ),
      ),
    );
  }

  Widget _themed(BuildContext context, PromoTheme th, VoidCallback onTap) {
    final fg = th.tx;
    final isSplit = th.layout == PromoLayout.split;
    final top = Padding(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Reserve the right lane for split-theme art so text never overlaps.
          Expanded(flex: isSplit ? 60 : 100, child: _textBlock(fg, reward: true)),
          if (isSplit) const Expanded(flex: 40, child: SizedBox()),
        ],
      ),
    );
    return GestureDetector(
      onTap: onTap,
      child: PromoSurface(
        theme: th,
        variant: PromoVariant.card,
        radius: 20,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [top, _tearFooter(context, fg, Colors.black.withValues(alpha: 0.14))],
        ),
      ),
    );
  }

  Widget _textBlock(Color fg, {bool reward = false}) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(coupon.title.isNotEmpty ? coupon.title : 'Wallet offer', style: Ob.title.copyWith(color: fg, fontSize: 19)),
          const SizedBox(height: 6),
          Text(_bodyText(coupon), style: Ob.subtitle.copyWith(color: fg.withValues(alpha: 0.9), fontSize: 13.5)),
          if (coupon.minimumRecharge > 0) ...[
            const SizedBox(height: 6),
            Text('On recharge of ${Money.formatPaise(coupon.minimumRecharge)} or more',
                style: Ob.option.copyWith(color: fg.withValues(alpha: 0.75), fontSize: 11.5),),
          ],
          if (reward) ...[
            const SizedBox(height: 10),
            _rewardBadge(),
          ],
        ],
      );

  Widget _rewardBadge() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(gradient: Ob.goldGradient, borderRadius: BorderRadius.circular(12)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('+${Money.formatPaise(coupon.reward)}', style: Ob.title.copyWith(color: Ob.navy, fontSize: 16)),
            Text('reward', style: Ob.option.copyWith(color: Ob.navy, fontSize: 10, fontWeight: FontWeight.w600)),
          ],
        ),
      );

  Widget _tearFooter(BuildContext context, Color fg, Color barBg) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        decoration: BoxDecoration(
          color: barBg,
          borderRadius: const BorderRadius.only(bottomLeft: Radius.circular(20), bottomRight: Radius.circular(20)),
        ),
        child: Row(
          children: [
            Icon(Icons.confirmation_number_outlined, color: fg, size: 18),
            const SizedBox(width: 8),
            Text(coupon.code, style: Ob.option.copyWith(color: fg, fontWeight: FontWeight.w800, letterSpacing: 1.5, fontSize: 15)),
            const Spacer(),
            GestureDetector(
              onTap: () {
                Clipboard.setData(ClipboardData(text: coupon.code));
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Copied ${coupon.code}'), duration: const Duration(seconds: 1)),
                );
              },
              child: Row(
                children: [
                  Icon(Icons.copy_rounded, color: fg, size: 15),
                  const SizedBox(width: 4),
                  Text('Copy', style: Ob.option.copyWith(color: fg, fontWeight: FontWeight.w600, fontSize: 12.5)),
                ],
              ),
            ),
            const SizedBox(width: 14),
            Text('Use  →', style: Ob.option.copyWith(color: fg, fontWeight: FontWeight.w800, fontSize: 13)),
          ],
        ),
      );
}
