import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../profile_setup/onboarding_style.dart';

/// The first-recharge welcome offer ("Triple Dhamaka"). Shown on the home screen
/// to users who haven't recharged yet. The ₹29.5 button opens the promo recharge
/// (₹25 + GST → ₹50 credited, first-recharge only, server-enforced). "No thanks"
/// reveals the ₹27 signup credit they already have.
const String _welcomeImg = 'assets/promo/welcome.webp';
const String _promoPlanId = 'promo_welcome';

/// Opens the welcome-offer bottom sheet. [chatCreditPaise] is the user's real
/// signup credit, shown truthfully in the "No thanks" popup.
Future<void> showWelcomeOffer(BuildContext context, {required int chatCreditPaise}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.5),
    builder: (_) => _WelcomeSheet(chatCreditPaise: chatCreditPaise),
  );
}

class _WelcomeSheet extends StatefulWidget {
  const _WelcomeSheet({required this.chatCreditPaise});
  final int chatCreditPaise;

  @override
  State<_WelcomeSheet> createState() => _WelcomeSheetState();
}

class _WelcomeSheetState extends State<_WelcomeSheet> with TickerProviderStateMixin {
  late final AnimationController _entrance =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 850))..forward();
  late final AnimationController _float =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 2600))..repeat(reverse: true);
  // Particles fall top→bottom on a ONE-WAY loop (no reverse), so they never
  // travel back upward. Whole-number fall speeds keep the loop reset seamless.
  late final AnimationController _fall =
      AnimationController(vsync: this, duration: const Duration(seconds: 6))..repeat();
  bool _showBreakup = false;

  @override
  void dispose() {
    _entrance.dispose();
    _float.dispose();
    _fall.dispose();
    super.dispose();
  }

  void _pay() {
    Navigator.of(context).pop();
    context.push('/recharge?plan=$_promoPlanId');
  }

  void _decline() {
    Navigator.of(context).pop();
    showWelcomeReward(context, chatCreditPaise: widget.chatCreditPaise);
  }

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.of(context).size.height * 0.64;
    return SizedBox(
      height: h,
      child: Stack(
        children: [
          // Sheet body
          ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xFFECE1FB), Color(0xFFEDF1F8), Color(0xFFF7F9FC), Color(0xFFFFFFFF)],
                  stops: [0, .38, .72, 1],
                ),
              ),
              child: Stack(
                children: [
                  Positioned.fill(child: _FallingParticles(controller: _fall)),
                  SafeArea(
                    top: false,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(22, 12, 22, 16),
                      child: Column(
                        children: [
                          Container(
                            width: 44, height: 5,
                            decoration: BoxDecoration(color: const Color(0xFFD9CAF1), borderRadius: BorderRadius.circular(99)),
                          ),
                          const SizedBox(height: 16),
                          _title(),
                          const SizedBox(height: 7),
                          _walletLine(),
                          Expanded(child: _character()),
                          _offerLine(),
                          const SizedBox(height: 12),
                          _buttons(),
                          const SizedBox(height: 10),
                          _totalPayment(),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (_showBreakup) _breakupOverlay(),
        ],
      ),
    );
  }

  Widget _title() {
    return RichText(
      text: TextSpan(
        style: GoogleFonts.cormorantGaramond(fontSize: 27, fontWeight: FontWeight.w600, height: 1),
        children: const [
          TextSpan(text: 'Triple ', style: TextStyle(color: Ob.navy)),
          TextSpan(text: 'Dhamaka', style: TextStyle(color: Color(0xFFC88617))),
        ],
      ),
    );
  }

  Widget _walletLine() {
    return Text.rich(
      TextSpan(
        style: Ob.note.copyWith(fontSize: 14.5, color: const Color(0xFF6B6390), fontWeight: FontWeight.w600),
        children: const [
          TextSpan(text: 'Get '),
          TextSpan(text: '₹77', style: TextStyle(color: Ob.goldDeep, fontWeight: FontWeight.w900)),
          TextSpan(text: ' in your wallet'),
        ],
      ),
    );
  }

  Widget _character() {
    return AnimatedBuilder(
      animation: Listenable.merge([_entrance, _float]),
      builder: (context, _) {
        final e = _entrance.value.clamp(0.0, 1.0);
        final pop = Curves.easeOutBack.transform(e); // slight overshoot
        final entranceY = (1 - e) * 24;
        final floatY = -7 * _float.value * e;
        return Opacity(
          opacity: e,
          child: Transform.translate(
            offset: Offset(0, entranceY + floatY),
            child: Transform.scale(
              scale: 0.82 + 0.18 * pop,
              alignment: Alignment.bottomCenter,
              child: Stack(
                clipBehavior: Clip.none,
                alignment: Alignment.center,
                children: [
                  Image.asset(_welcomeImg, fit: BoxFit.contain),
                  _handSpark(left: true),
                  _handSpark(left: false),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _handSpark({required bool left}) {
    final tw = (0.3 + 0.7 * (left ? _float.value : 1 - _float.value)).clamp(0.0, 1.0);
    return Positioned(
      top: 40,
      left: left ? 8 : null,
      right: left ? null : 8,
      child: Opacity(
        opacity: tw,
        child: const Icon(Icons.auto_awesome, size: 15, color: Color(0xFFF4C64B)),
      ),
    );
  }

  Widget _offerLine() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _hair(true),
        const SizedBox(width: 6),
        const Icon(Icons.auto_awesome, size: 11, color: Color(0xFFC88617)),
        const SizedBox(width: 6),
        Text('Grab this one-time offer',
            style: Ob.note.copyWith(fontSize: 12.5, color: Ob.navy, fontWeight: FontWeight.w700),),
        const SizedBox(width: 6),
        const Icon(Icons.auto_awesome, size: 11, color: Color(0xFFC88617)),
        const SizedBox(width: 6),
        _hair(false),
      ],
    );
  }

  Widget _hair(bool leftFade) => Container(
        width: 14, height: 1,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: leftFade
                ? const [Color(0xFFD8CDEB), Colors.transparent]
                : const [Colors.transparent, Color(0xFFD8CDEB)],
          ),
        ),
      );

  Widget _buttons() {
    return Row(
      children: [
        Expanded(
          child: _CtaButton(
            onTap: _pay,
            gradient: const LinearGradient(colors: [Color(0xFF5B79C0), Color(0xFF5A3BBC)]),
            borderColor: const Color(0xFFF0DE95),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.account_balance_wallet_outlined, size: 17, color: Colors.white),
                const SizedBox(width: 7),
                Text('₹29.5', style: Ob.option.copyWith(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 17.5)),
              ],
            ),
          ),
        ),
        const SizedBox(width: 11),
        Expanded(
          child: _CtaButton(
            onTap: _decline,
            gradient: const LinearGradient(colors: [Color(0xFFF7DE88), Color(0xFFE7BE46)]),
            borderColor: const Color(0xFFCE9E2A),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('No, thanks', style: Ob.option.copyWith(color: const Color(0xFF5A3F12), fontWeight: FontWeight.w800, fontSize: 13.5)),
                const SizedBox(width: 5),
                const Icon(Icons.arrow_forward_rounded, size: 16, color: Color(0xFF5A3F12)),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _totalPayment() {
    return Align(
      alignment: Alignment.centerLeft,
      child: GestureDetector(
        onTap: () => setState(() => _showBreakup = !_showBreakup),
        behavior: HitTestBehavior.opaque,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Total Payment', style: Ob.note.copyWith(fontSize: 12.5, color: const Color(0xFF1C1633), fontWeight: FontWeight.w700)),
            const SizedBox(width: 6),
            Container(
              width: 15, height: 15,
              alignment: Alignment.center,
              decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: const Color(0xFF7A7693), width: 1.3)),
              child: Text('i', style: GoogleFonts.notoSerif(fontSize: 9, fontStyle: FontStyle.italic, fontWeight: FontWeight.w800, color: const Color(0xFF7A7693))),
            ),
          ],
        ),
      ),
    );
  }

  Widget _breakupOverlay() {
    return Positioned.fill(
      child: GestureDetector(
        onTap: () => setState(() => _showBreakup = false),
        behavior: HitTestBehavior.opaque,
        child: Padding(
          padding: EdgeInsets.only(left: 22, bottom: 46 + MediaQuery.of(context).padding.bottom),
          child: Align(
            alignment: Alignment.bottomLeft,
            child: Container(
              width: 218,
              padding: const EdgeInsets.fromLTRB(15, 13, 15, 13),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                boxShadow: [BoxShadow(color: const Color(0xFF3C2878).withValues(alpha: 0.22), blurRadius: 30, offset: const Offset(0, 12))],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Payment Details', style: Ob.option.copyWith(fontWeight: FontWeight.w800, fontSize: 14.5, color: const Color(0xFF1C1633))),
                  const SizedBox(height: 9),
                  _brow('Total Amount', '₹25.00'),
                  _brow('GST @ 18%', '₹4.50'),
                  const Padding(padding: EdgeInsets.symmetric(vertical: 5), child: Divider(height: 1, color: Color(0xFFECE3F8))),
                  _brow('Grand Total', '₹29.50', bold: true),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _brow(String k, String v, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3.5),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(k, style: Ob.note.copyWith(fontSize: 13, color: bold ? const Color(0xFF1C1633) : const Color(0xFF5B5480), fontWeight: bold ? FontWeight.w800 : FontWeight.w500)),
            Text(v, style: Ob.note.copyWith(fontSize: 13, color: bold ? const Color(0xFF1C1633) : const Color(0xFF5B5480), fontWeight: bold ? FontWeight.w800 : FontWeight.w600)),
          ],
        ),
      );
}

class _CtaButton extends StatelessWidget {
  const _CtaButton({required this.onTap, required this.gradient, required this.borderColor, required this.child});
  final VoidCallback onTap;
  final Gradient gradient;
  final Color borderColor;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 50,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          gradient: gradient,
          borderRadius: BorderRadius.circular(15),
          border: Border.all(color: borderColor, width: 1.5),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.14), blurRadius: 16, offset: const Offset(0, 8))],
        ),
        child: child,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Reward popup shown after "No, thanks".
// ---------------------------------------------------------------------------
Future<void> showWelcomeReward(BuildContext context, {required int chatCreditPaise}) {
  final amt = chatCreditPaise > 0 ? Money.formatPaise(chatCreditPaise) : '₹27';
  return showDialog<void>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.45),
    builder: (_) => _RewardPopup(amount: amt),
  );
}

class _RewardPopup extends StatefulWidget {
  const _RewardPopup({required this.amount});
  final String amount;
  @override
  State<_RewardPopup> createState() => _RewardPopupState();
}

class _RewardPopupState extends State<_RewardPopup> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 26),
      child: ScaleTransition(
        scale: CurvedAnimation(parent: _c, curve: Curves.easeOutBack),
        child: Container(
          padding: const EdgeInsets.fromLTRB(18, 22, 18, 20),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topCenter, end: Alignment.bottomCenter,
              colors: [Color(0xFFF1E9FD), Color(0xFFFAF7FF), Color(0xFFFFFFFF)],
            ),
            borderRadius: BorderRadius.circular(26),
            boxShadow: [BoxShadow(color: const Color(0xFF1E0F32).withValues(alpha: 0.4), blurRadius: 40, offset: const Offset(0, 20))],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('🎉', style: TextStyle(fontSize: 38)),
              const SizedBox(height: 4),
              Text.rich(
                TextSpan(
                  style: Ob.option.copyWith(fontSize: 15.5, color: Ob.navy, fontWeight: FontWeight.w700, height: 1.4),
                  children: [
                    TextSpan(text: widget.amount, style: const TextStyle(color: Color(0xFFC68F1E), fontWeight: FontWeight.w900)),
                    const TextSpan(text: ' is still credited to your wallet '),
                    const TextSpan(text: 'because we love you here', style: TextStyle(color: Color(0xFF1E9E63), fontWeight: FontWeight.w800)),
                  ],
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 18),
              // 3D outlined tagline pill.
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFFFBF7FF), Color(0xFFEBE1FB)]),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: const Color(0xFF5B79C0), width: 1.5),
                  boxShadow: const [
                    BoxShadow(color: Color(0xFFC6B2EC), offset: Offset(0, 5)),
                    BoxShadow(color: Color(0x4C1E3269), blurRadius: 18, offset: Offset(0, 12)),
                  ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Aap Khush Toh Hum Khush',
                        style: Ob.note.copyWith(fontSize: 11.5, fontWeight: FontWeight.w800, color: Ob.purpleDeep),),
                    const SizedBox(width: 6),
                    const Text('😊', style: TextStyle(fontSize: 16)),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              GestureDetector(
                onTap: () => Navigator.of(context).maybePop(),
                behavior: HitTestBehavior.opaque,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
                  child: Text('Start my first reading →',
                      style: Ob.note.copyWith(fontSize: 12.5, fontWeight: FontWeight.w700, color: Ob.navy),),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Falling particles: stars, gold coins and dots drifting down the sheet.
// ---------------------------------------------------------------------------
enum _PType { star, coin, dot }

class _P {
  _P(this.type, this.x, this.size, this.phase, this.speed, this.glyph, this.color);
  final _PType type;
  final double x, size, phase, speed;
  final String glyph;
  final Color color;
}

class _FallingParticles extends StatelessWidget {
  const _FallingParticles({required this.controller});
  final AnimationController controller;

  static final _rng = math.Random(7);
  static final List<_P> _parts = _build();

  static List<_P> _build() {
    const starGlyphs = ['✦', '✧', '⋆', '✦'];
    const starColors = [Color(0xFFE7B93C), Color(0xFFB79BE6), Color(0xFFDDE3EC), Color(0xFF5B79C0)];
    // speed MUST be a whole number of screen-traversals per controller cycle so
    // the one-way loop wraps seamlessly (base 1→0 leaves prog unchanged). 1 = a
    // slow fall, 2 = roughly twice as fast; phase staggers the vertical spread.
    final out = <_P>[];
    for (var i = 0; i < 11; i++) {
      final k = _rng.nextInt(4);
      out.add(_P(_PType.star, _rng.nextDouble(), 10 + _rng.nextDouble() * 13, _rng.nextDouble(),
          (1 + _rng.nextInt(2)).toDouble(), starGlyphs[k], starColors[k],),);
    }
    for (var i = 0; i < 8; i++) {
      out.add(_P(_PType.coin, _rng.nextDouble(), 13 + _rng.nextDouble() * 9, _rng.nextDouble(),
          (1 + _rng.nextInt(2)).toDouble(), '', const Color(0xFFE9BE48),),);
    }
    for (var i = 0; i < 9; i++) {
      out.add(_P(_PType.dot, _rng.nextDouble(), 3 + _rng.nextDouble() * 4, _rng.nextDouble(),
          (1 + _rng.nextInt(2)).toDouble(), '', _rng.nextBool() ? const Color(0xFFC6CCD6) : const Color(0xFFB79BE6),),);
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, box) {
      final h = box.maxHeight, w = box.maxWidth;
      return AnimatedBuilder(
        animation: controller,
        builder: (context, _) {
          final base = controller.value; // 0→1 one-way (repeat, no reverse): a steady downward fall
          return Stack(
            children: [
              for (final p in _parts) _draw(p, w, h, base),
            ],
          );
        },
      );
    },);
  }

  Widget _draw(_P p, double w, double h, double base) {
    final prog = ((base * p.speed) + p.phase) % 1.0;
    final y = -24 + prog * (h + 48);
    double op;
    if (prog < 0.12) {
      op = prog / 0.12;
    } else if (prog > 0.88) {
      op = (1 - prog) / 0.12;
    } else {
      op = 1;
    }
    Widget child;
    switch (p.type) {
      case _PType.star:
        child = Text(p.glyph, style: TextStyle(fontSize: p.size, color: p.color));
        break;
      case _PType.coin:
        child = Container(
          width: p.size, height: p.size,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(center: Alignment(-0.3, -0.4), colors: [Color(0xFFFCEAA0), Color(0xFFE9BE48), Color(0xFFC68F1E)], stops: [0, .58, 1]),
          ),
          child: Text('✦', style: TextStyle(fontSize: p.size * 0.5, color: const Color(0xFF8A5F13))),
        );
        break;
      case _PType.dot:
        child = Container(width: p.size, height: p.size, decoration: BoxDecoration(shape: BoxShape.circle, color: p.color));
        break;
    }
    return Positioned(
      left: p.x * (w - 20),
      top: y,
      child: Opacity(opacity: op.clamp(0.0, 0.95), child: child),
    );
  }
}
