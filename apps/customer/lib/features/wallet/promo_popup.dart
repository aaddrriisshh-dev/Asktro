import 'package:flutter/material.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../profile_setup/onboarding_style.dart';
import 'promo_surface.dart';

/// One shared celestial promo popup, used by coupons, banners and push so the
/// themed look (hero, gold-adaptive headline, sizing) is identical everywhere.
/// The caller passes the copy + what the button does; the display mode
/// ('small' | 'half' | 'full') and theme decide how it renders.
///
///  - small → centre card dialog
///  - half  → bottom sheet
///  - full  → full-screen takeover with a hero zone
///
/// `code` shows a coupon-style pill (null hides it). `onAction` fires when the
/// primary button is tapped (the popup dismisses itself first).
Future<void> showPromoPopup(
  BuildContext context, {
  required PromoTheme? theme,
  required String displayMode,
  required String title,
  required String body,
  required VoidCallback onAction,
  String ctaLabel = 'Grab this offer',
  String? code,
  String medal = '🎁',
  bool showMaybeLater = true,
  String heroKicker = '✦  A GIFT FOR YOU',
  String? heroTagline = 'Everyone loves a gift, right?',
}) {
  final th = theme;
  if (th != null && displayMode == 'full') {
    return _full(context, th, title, body, onAction, ctaLabel, code, heroKicker, heroTagline);
  }
  if (th != null && displayMode == 'half') {
    return _half(context, th, title, body, onAction, ctaLabel, code);
  }
  return _center(context, th, title, body, onAction, ctaLabel, code, medal, showMaybeLater);
}

// ---- shared building blocks -------------------------------------------------

Widget _pill(String code, Color fg, Color chipBg) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
      decoration: BoxDecoration(color: chipBg, borderRadius: BorderRadius.circular(12)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.confirmation_number_outlined, color: fg, size: 18),
          const SizedBox(width: 8),
          Text(code, style: Ob.option.copyWith(color: fg, fontWeight: FontWeight.w800, letterSpacing: 1.5, fontSize: 15)),
        ],
      ),
    );

Widget _closeBtn(BuildContext ctx, Color fg) => GestureDetector(
      onTap: () => Navigator.of(ctx).pop(),
      child: Container(
        width: 32,
        height: 32,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.22), shape: BoxShape.circle),
        child: Icon(Icons.close_rounded, color: fg, size: 19),
      ),
    );

Widget _actionCta(BuildContext ctx, PromoTheme? th, String label, VoidCallback onAction) {
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
          onAction();
        },
        child: Ink(
          decoration: BoxDecoration(gradient: grad, borderRadius: BorderRadius.circular(14)),
          child: Container(
            height: 50,
            alignment: Alignment.center,
            child: Text(label, style: Ob.option.copyWith(color: txt, fontWeight: FontWeight.w800, fontSize: 15)),
          ),
        ),
      ),
    ),
  );
}

// ---- centre card (small) ----------------------------------------------------

Future<void> _center(BuildContext context, PromoTheme? th, String title, String body,
    VoidCallback onAction, String ctaLabel, String? code, String medal, bool showMaybeLater) {
  return showDialog(
    context: context,
    barrierDismissible: true,
    builder: (ctx) {
      final fg = th?.tx ?? Ob.navy;
      final head = th != null ? promoHeadline(th) : fg;
      final content = Padding(
        padding: const EdgeInsets.fromLTRB(22, 24, 22, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(14),
              decoration: const BoxDecoration(gradient: Ob.goldGradient, shape: BoxShape.circle),
              child: Text(medal, style: const TextStyle(fontSize: 30)),
            ),
            const SizedBox(height: 14),
            Text(title, style: Ob.title.copyWith(fontSize: 22, color: head), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(body, style: Ob.subtitle.copyWith(fontSize: 14, color: fg.withValues(alpha: 0.9)), textAlign: TextAlign.center),
            if (code != null) ...[
              const SizedBox(height: 16),
              _pill(code, fg, th != null ? fg.withValues(alpha: 0.16) : Ob.purple),
            ],
            const SizedBox(height: 18),
            _actionCta(ctx, th, ctaLabel, onAction),
            if (showMaybeLater)
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: Text('Maybe later', style: Ob.option.copyWith(color: fg.withValues(alpha: 0.8), fontWeight: FontWeight.w600)),
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

// ---- half sheet -------------------------------------------------------------

Future<void> _half(BuildContext context, PromoTheme th, String title, String body,
    VoidCallback onAction, String ctaLabel, String? code) {
  final fg = th.tx;
  final head = promoHeadline(th);
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
                    Text(title, style: Ob.title.copyWith(color: head, fontSize: 28, height: 1.15), textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    Text(body, style: Ob.subtitle.copyWith(color: fg.withValues(alpha: 0.92), fontSize: 16, height: 1.35), textAlign: TextAlign.center),
                    if (code != null) ...[
                      const SizedBox(height: 18),
                      _pill(code, fg, fg.withValues(alpha: 0.16)),
                    ],
                    const SizedBox(height: 16),
                    _actionCta(ctx, th, ctaLabel, onAction),
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

// ---- full-screen takeover ---------------------------------------------------

Future<void> _full(BuildContext context, PromoTheme th, String title, String body,
    VoidCallback onAction, String ctaLabel, String? code, String kicker, String? tagline) {
  final fg = th.tx;
  final head = promoHeadline(th);
  return showGeneralDialog(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'offer',
    barrierColor: Colors.black54,
    transitionDuration: const Duration(milliseconds: 220),
    // Wrapped in a transparent Material so Text doesn't render with Flutter's
    // yellow debug underline (showGeneralDialog has no Material ancestor).
    pageBuilder: (ctx, _, __) => Material(
      type: MaterialType.transparency,
      child: Stack(
        fit: StackFit.expand,
        children: [
          PromoSurface(theme: th, variant: PromoVariant.full, radius: 0, showFrame: false, artHero: false, child: const SizedBox.expand()),
          SafeArea(
            child: Stack(
              children: [
                Positioned(top: 10, right: 16, child: _closeBtn(ctx, fg)),
                Padding(
                  padding: const EdgeInsets.fromLTRB(28, 40, 28, 40),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      // Hero zone — fills the upper half so the takeover never feels blank.
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(kicker,
                              style: Ob.option.copyWith(color: head, fontWeight: FontWeight.w700, fontSize: 12, letterSpacing: 2, decoration: TextDecoration.none),
                              textAlign: TextAlign.center),
                          const SizedBox(height: 22),
                          SizedBox(
                            height: 150,
                            width: 150,
                            child: Stack(
                              alignment: Alignment.center,
                              children: [
                                DecoratedBox(
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    gradient: RadialGradient(
                                      colors: [Ob.gold.withValues(alpha: 0.34), Ob.gold.withValues(alpha: 0.0)],
                                      stops: const [0.15, 1.0],
                                    ),
                                  ),
                                  child: const SizedBox.expand(),
                                ),
                                Image.asset(Ob.gift, height: 118),
                              ],
                            ),
                          ),
                          if (tagline != null) ...[
                            const SizedBox(height: 14),
                            Text(tagline,
                                style: Ob.title.copyWith(color: head, fontSize: 20, fontStyle: FontStyle.italic, decoration: TextDecoration.none),
                                textAlign: TextAlign.center),
                          ],
                        ],
                      ),
                      // Offer zone — anchored to the bottom.
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(title,
                              style: Ob.title.copyWith(color: head, fontSize: 32, height: 1.12, decoration: TextDecoration.none),
                              textAlign: TextAlign.center),
                          const SizedBox(height: 12),
                          Text(body,
                              style: Ob.subtitle.copyWith(color: fg.withValues(alpha: 0.92), fontSize: 16, height: 1.35, decoration: TextDecoration.none),
                              textAlign: TextAlign.center),
                          if (code != null) ...[
                            const SizedBox(height: 22),
                            _pill(code, fg, fg.withValues(alpha: 0.16)),
                          ],
                          const SizedBox(height: 18),
                          _actionCta(ctx, th, ctaLabel, onAction),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}
