import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../profile_setup/onboarding_style.dart';
import '../profile_setup/onboarding_widgets.dart';
import 'promo_surface.dart';

final _couponsProvider = StreamProvider.autoDispose<List<Coupon>>(
    (ref) => ref.watch(catalogRepositoryProvider).watchCoupons());

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

Widget _codePill(Coupon c, Color fg, Color chipBg) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
      decoration: BoxDecoration(color: chipBg, borderRadius: BorderRadius.circular(12)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.confirmation_number_outlined, color: fg, size: 18),
          const SizedBox(width: 8),
          Text(c.code, style: Ob.option.copyWith(color: fg, fontWeight: FontWeight.w800, letterSpacing: 1.5, fontSize: 15)),
        ],
      ),
    );

Widget _grabCta(BuildContext ctx, Coupon c, PromoTheme? th) {
  final grad = th != null ? promoAccent(th) : const LinearGradient(colors: kPromoGoldAccent);
  final txt = th?.accentTx ?? Ob.navy;
  return SizedBox(
    width: double.infinity,
    child: Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () {
          Navigator.of(ctx).pop();
          ctx.push('/recharge?coupon=${Uri.encodeComponent(c.code)}');
        },
        child: Ink(
          decoration: BoxDecoration(gradient: grad, borderRadius: BorderRadius.circular(14)),
          child: Container(
            height: 50,
            alignment: Alignment.center,
            child: Text('Grab this offer', style: Ob.option.copyWith(color: txt, fontWeight: FontWeight.w800, fontSize: 15)),
          ),
        ),
      ),
    ),
  );
}

Widget _closeBtn(BuildContext ctx, Color fg) => GestureDetector(
      onTap: () => Navigator.of(ctx).pop(),
      child: Container(
        width: 32,
        height: 32,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: Colors.black.withOpacity(0.22), shape: BoxShape.circle),
        child: Icon(Icons.close_rounded, color: fg, size: 19),
      ),
    );

// ---- app-open popup: follows the coupon's Small / Half / Full mode -----------

/// Shown when the app opens (and reused as a preview). Renders the newest active
/// coupon in the theme + display-mode the admin picked: full-screen takeover,
/// half-sheet, or a centre card.
Future<void> showOfferPopup(BuildContext context, Coupon coupon) {
  final th = promoThemeById(coupon.theme);
  final mode = coupon.displayMode;
  if (th != null && mode == 'full') return _showFull(context, coupon, th);
  if (th != null && mode == 'half') return _showHalf(context, coupon, th);
  return _showCenter(context, coupon, th);
}

Future<void> _showCenter(BuildContext context, Coupon c, PromoTheme? th) {
  return showDialog(
    context: context,
    barrierDismissible: true,
    builder: (ctx) {
      final fg = th?.tx ?? Ob.navy;
      final content = Padding(
        padding: const EdgeInsets.fromLTRB(22, 24, 22, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(14),
              decoration: const BoxDecoration(gradient: Ob.goldGradient, shape: BoxShape.circle),
              child: Text(th?.medal ?? '🎁', style: const TextStyle(fontSize: 30)),
            ),
            const SizedBox(height: 14),
            Text(_ttl(c), style: Ob.title.copyWith(fontSize: 22, color: fg), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(_bodyText(c), style: Ob.subtitle.copyWith(fontSize: 14, color: fg.withOpacity(0.9)), textAlign: TextAlign.center),
            const SizedBox(height: 16),
            _codePill(c, fg, th != null ? fg.withOpacity(0.16) : _hex(c.bgColor, Ob.purple)),
            const SizedBox(height: 18),
            _grabCta(ctx, c, th),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: Text('Maybe later', style: Ob.option.copyWith(color: fg.withOpacity(0.8), fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      );
      return Dialog(
        backgroundColor: th == null ? Ob.bgColor : Colors.transparent,
        elevation: 0,
        insetPadding: const EdgeInsets.symmetric(horizontal: 30),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(26)),
        child: th == null
            ? ClipRRect(borderRadius: BorderRadius.circular(26), child: content)
            : PromoSurface(theme: th, variant: PromoVariant.card, radius: 26, child: content),
      );
    },
  );
}

Future<void> _showHalf(BuildContext context, Coupon c, PromoTheme th) {
  final fg = th.tx;
  return showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (ctx) => ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(26)),
      child: SizedBox(
        height: MediaQuery.of(ctx).size.height * 0.56,
        child: Stack(
          children: [
            PromoSurface(theme: th, variant: PromoVariant.half, radius: 0, showFrame: false, child: const SizedBox.expand()),
            Positioned(top: 12, right: 16, child: _closeBtn(ctx, fg)),
            Center(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(26, 20, 26, 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_ttl(c), style: Ob.title.copyWith(color: fg, fontSize: 23), textAlign: TextAlign.center),
                    const SizedBox(height: 10),
                    Text(_bodyText(c), style: Ob.subtitle.copyWith(color: fg.withOpacity(0.92), fontSize: 14), textAlign: TextAlign.center),
                    const SizedBox(height: 18),
                    _codePill(c, fg, fg.withOpacity(0.16)),
                    const SizedBox(height: 16),
                    _grabCta(ctx, c, th),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

Future<void> _showFull(BuildContext context, Coupon c, PromoTheme th) {
  final fg = th.tx;
  return showGeneralDialog(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'offer',
    barrierColor: Colors.black54,
    transitionDuration: const Duration(milliseconds: 220),
    pageBuilder: (ctx, _, __) => Stack(
      fit: StackFit.expand,
      children: [
        PromoSurface(theme: th, variant: PromoVariant.full, radius: 0, showFrame: false, child: const SizedBox.expand()),
        SafeArea(
          child: Stack(
            children: [
              Positioned(top: 10, right: 16, child: _closeBtn(ctx, fg)),
              Align(
                alignment: Alignment.bottomCenter,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(26, 24, 26, 32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(_ttl(c), style: Ob.title.copyWith(color: fg, fontSize: 27), textAlign: TextAlign.center),
                      const SizedBox(height: 10),
                      Text(_bodyText(c), style: Ob.subtitle.copyWith(color: fg.withOpacity(0.92), fontSize: 15), textAlign: TextAlign.center),
                      const SizedBox(height: 18),
                      _codePill(c, fg, fg.withOpacity(0.16)),
                      const SizedBox(height: 14),
                      _grabCta(ctx, c, th),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    ),
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
    return Scaffold(
      backgroundColor: Ob.bgColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Ob.navy,
        title: Text('Offers', style: Ob.title.copyWith(fontSize: 22)),
      ),
      body: coupons.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Ob.purple)),
        error: (_, __) => const ErrorStateView(),
        data: (list) {
          if (list.isEmpty) {
            return const EmptyState(
              icon: Icons.local_offer_outlined,
              title: 'No offers right now',
              message: 'Check back soon — new coupons drop regularly.',
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: 14),
            itemBuilder: (_, i) => _OfferCard(coupon: list[i]),
          );
        },
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
    final onTap = () => context.push('/recharge?coupon=${Uri.encodeComponent(coupon.code)}');
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
            _tearFooter(context, fg, Colors.white.withOpacity(0.12)),
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
          children: [top, _tearFooter(context, fg, Colors.black.withOpacity(0.14))],
        ),
      ),
    );
  }

  Widget _textBlock(Color fg, {bool reward = false}) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(coupon.title.isNotEmpty ? coupon.title : 'Wallet offer', style: Ob.title.copyWith(color: fg, fontSize: 19)),
          const SizedBox(height: 6),
          Text(_bodyText(coupon), style: Ob.subtitle.copyWith(color: fg.withOpacity(0.9), fontSize: 13.5)),
          if (coupon.minimumRecharge > 0) ...[
            const SizedBox(height: 6),
            Text('On recharge of ${Money.formatPaise(coupon.minimumRecharge)} or more',
                style: Ob.option.copyWith(color: fg.withOpacity(0.75), fontSize: 11.5)),
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
