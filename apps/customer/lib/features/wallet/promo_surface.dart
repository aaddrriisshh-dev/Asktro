import 'package:flutter/material.dart';
import 'package:shared_flutter/shared_flutter.dart';

/// Which surface the theme is being drawn on — controls art placement so it
/// never collides with text (verified against the portal preview):
///  - card: gift/mandala right-anchored beside left text; wheel watermark top-right.
///  - full: gift/mandala as a centred hero; wheel a centred watermark.
///  - half: split art steps aside (clean sheet); wheel watermark behind.
enum PromoVariant { card, half, full }

const _artAsset = <String, String>{
  'gift': 'assets/onboarding/giftbox.webp',
  'mandala': 'assets/onboarding/puja_mandala.webp',
  'scenery': 'assets/onboarding/scenery.webp',
};

/// Paints a celestial [PromoTheme] (gradient / photo + art + golden frame) and
/// stacks [child] on top. The child drives the size (except full-screen, where
/// the caller expands it).
class PromoSurface extends StatelessWidget {
  const PromoSurface({
    super.key,
    required this.theme,
    required this.child,
    this.variant = PromoVariant.card,
    this.radius = 20,
    this.showFrame = true,
  });

  final PromoTheme theme;
  final Widget child;
  final PromoVariant variant;
  final double radius;
  final bool showFrame;

  Widget _wheel(String art) {
    final color = art == 'zgold'
        ? const Color(0xFFF0CD6E)
        : art == 'zwhite'
            ? Colors.white
            : const Color(0xFF7E57C2);
    // BlendMode.srcIn recolours the line-art while keeping its alpha.
    return ColorFiltered(
      colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
      child: Image.asset('assets/onboarding/zodiac_wheel.png', fit: BoxFit.contain),
    );
  }

  Widget _background() {
    if (theme.isPhoto) {
      return Stack(fit: StackFit.expand, children: [
        Image.asset(_artAsset['scenery']!, fit: BoxFit.cover, alignment: Alignment.topCenter),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: theme.bg),
          ),
        ),
      ]);
    }
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: theme.radial
            ? RadialGradient(center: const Alignment(-0.4, -0.6), radius: 1.2, colors: theme.bg)
            : LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: theme.bg),
      ),
    );
  }

  List<Widget> _art() {
    final art = theme.art;
    if (art == null) return const [];
    final out = <Widget>[];
    final isSplit = theme.layout == PromoLayout.split && art != 'scenery';
    if (isSplit) {
      final img = Image.asset(_artAsset[art]!, fit: BoxFit.contain);
      if (variant == PromoVariant.card) {
        out.add(Positioned.fill(child: IgnorePointer(child: Align(
          alignment: Alignment.centerRight,
          child: FractionallySizedBox(widthFactor: 0.46, heightFactor: 0.94, alignment: Alignment.centerRight, child: img),
        ))));
      } else if (variant == PromoVariant.full) {
        out.add(Positioned.fill(child: IgnorePointer(child: Align(
          alignment: const Alignment(0, -0.42),
          child: FractionallySizedBox(widthFactor: 0.66, heightFactor: 0.4, child: img),
        ))));
      }
      // half: intentionally no split art.
    } else if (theme.layout == PromoLayout.wm) {
      final wheel = Opacity(opacity: theme.op, child: _wheel(art));
      if (variant == PromoVariant.full) {
        out.add(Positioned.fill(child: IgnorePointer(child: Align(
          alignment: const Alignment(0.1, -0.35),
          child: FractionallySizedBox(widthFactor: 0.85, heightFactor: 0.5, child: wheel),
        ))));
      } else {
        out.add(Positioned.fill(child: IgnorePointer(child: Align(
          alignment: Alignment.topRight,
          child: FractionallySizedBox(
            widthFactor: 0.6, heightFactor: 1.3, alignment: Alignment.topRight,
            child: FractionalTranslation(translation: const Offset(0.12, -0.18), child: wheel),
          ),
        ))));
      }
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Stack(
        children: [
          Positioned.fill(child: _background()),
          ..._art(),
          if (showFrame)
            Positioned.fill(child: IgnorePointer(child: Padding(
              padding: const EdgeInsets.all(6),
              child: DecoratedBox(decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(radius > 6 ? radius - 6 : 0.0),
                border: Border.all(color: theme.edge, width: 1),
              )),
            ))),
          child,
        ],
      ),
    );
  }
}

/// The gold (or theme-specific) reward/CTA chip gradient.
LinearGradient promoAccent(PromoTheme t) =>
    LinearGradient(colors: t.accent ?? kPromoGoldAccent);
