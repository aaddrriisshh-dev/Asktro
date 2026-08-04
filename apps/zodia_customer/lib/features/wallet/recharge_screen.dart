import 'package:flutter/foundation.dart' show kDebugMode, debugPrint;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../data/messaging_service.dart';
import '../profile_setup/onboarding_style.dart';
import '../profile_setup/onboarding_widgets.dart';

final _plansProvider = StreamProvider.autoDispose<List<RechargePlan>>(
    (ref) => ref.watch(catalogRepositoryProvider).watchPlans(),);

/// "Add Cash" — pick an amount, then pay via Razorpay. The wallet is credited
/// server-side (Cloud Function) on payment verification.
class RechargeScreen extends ConsumerStatefulWidget {
  const RechargeScreen({super.key, this.preselectPlanId, this.preselectCoupon, this.lockAmountPaise});

  /// When opened from a Recharge banner (/recharge?plan=<id>), the matching
  /// plan is pre-selected so the user can pay in one tap.
  final String? preselectPlanId;

  /// When opened from the Offers screen (/recharge?coupon=<CODE>), the coupon
  /// field is pre-filled and auto-applied once a plan is selected.
  final String? preselectCoupon;

  /// When opened from a promo (/recharge?lock=<paise>), the screen locks to that
  /// single amount: the matching tile is auto-selected and every other amount is
  /// frozen. This is how coupon/banner/push offers force “recharge exactly ₹X”.
  final int? lockAmountPaise;

  @override
  ConsumerState<RechargeScreen> createState() => _RechargeScreenState();
}

class _RechargeScreenState extends ConsumerState<RechargeScreen> {
  late final Razorpay _razorpay;
  final _couponCtrl = TextEditingController();
  RechargePlan? _selected;
  RechargeOrder? _order;
  bool _processing = false;
  bool _appliedPreselect = false;

  // Applied-coupon state.
  CouponValidation? _coupon;
  bool _couponBusy = false;
  String? _couponError;

  @override
  void initState() {
    super.initState();
    _razorpay = Razorpay()
      ..on(Razorpay.EVENT_PAYMENT_SUCCESS, _onSuccess)
      ..on(Razorpay.EVENT_PAYMENT_ERROR, _onError)
      ..on(Razorpay.EVENT_EXTERNAL_WALLET, (_) {});
    final pre = widget.preselectCoupon;
    if (pre != null && pre.trim().isNotEmpty) _couponCtrl.text = pre.trim().toUpperCase();
  }

  @override
  void dispose() {
    _couponCtrl.dispose();
    _razorpay.clear();
    super.dispose();
  }

  // Friendly text for the server's coupon error codes.
  String _couponMessage(String code) {
    switch (code) {
      case 'COUPON_NOT_FOUND':
        return 'That code doesn\'t exist.';
      case 'COUPON_INACTIVE':
        return 'This coupon is no longer active.';
      case 'COUPON_EXPIRED':
        return 'This coupon has expired.';
      case 'COUPON_FOR_PAID_USERS':
        return 'Only for users who\'ve recharged before.';
      case 'COUPON_FOR_NEW_USERS':
        return 'Only for first-time users.';
      case 'MIN_RECHARGE_NOT_MET':
        return 'Pick a higher amount to use this coupon.';
      case 'COUPON_NOT_APPLICABLE_TO_PLAN':
        return 'Not valid on this amount.';
      case 'COUPON_USAGE_EXHAUSTED':
        return 'This coupon has been fully claimed.';
      case 'COUPON_ALREADY_USED':
        return 'You\'ve already used this coupon.';
      default:
        return 'This coupon can\'t be applied.';
    }
  }

  Future<void> _applyCoupon() async {
    final plan = _selected;
    final code = _couponCtrl.text.trim().toUpperCase();
    if (plan == null) {
      setState(() => _couponError = 'Select an amount first.');
      return;
    }
    if (code.isEmpty) return;
    setState(() {
      _couponBusy = true;
      _couponError = null;
    });
    final res = await ref.read(walletServiceProvider).validateCoupon(code, planId: plan.id);
    if (!mounted) return;
    setState(() => _couponBusy = false);
    res.when(
      success: (v) => setState(() {
        _coupon = v;
        _couponError = null;
      }),
      failure: (f) => setState(() {
        _coupon = null;
        _couponError = _couponMessage(f.message);
      }),
    );
  }

  void _removeCoupon() => setState(() {
        _coupon = null;
        _couponError = null;
        _couponCtrl.clear();
      });

  Future<void> _startRecharge() async {
    final plan = _selected;
    if (plan == null) return;
    setState(() => _processing = true);
    final res = await ref.read(walletServiceProvider).createOrder(plan.id, couponId: _coupon?.couponId);
    if (!mounted) return;
    res.when(
      success: (order) {
        _order = order;
        _razorpay.open({
          'key': order.keyId,
          'order_id': order.orderId,
          'amount': order.amount,
          'currency': order.currency,
          'name': 'ZODIA',
          'description': 'Wallet recharge',
          'prefill': {'contact': ref.read(myProfileProvider).valueOrNull?.phone ?? ''},
          'theme': {'color': '#2B2417'},
        });
      },
      failure: (f) {
        setState(() => _processing = false);
        _snack(f.message);
      },
    );
  }

  Future<void> _onSuccess(PaymentSuccessResponse r) async {
    final order = _order;
    final plan = _selected;
    if (order == null || plan == null) return;
    final res = await ref.read(walletServiceProvider).verify(
          orderId: order.orderId,
          paymentId: r.paymentId ?? '',
          signature: r.signature ?? '',
          planId: plan.id,
          couponId: _coupon?.couponId,
        );
    if (!mounted) return;
    setState(() => _processing = false);
    res.when(
      success: (_) {
        ref.read(analyticsProvider).logEvent(AnalyticsEvents.rechargeSuccess, params: {
          'planId': plan.id,
          'amount': plan.amount,
        },);
        _showSuccess(plan);
      },
      failure: (f) => _snack(f.message),
    );
  }

  void _onError(PaymentFailureResponse r) {
    if (!mounted) return;
    setState(() => _processing = false);
    _snack('Payment was not completed. Your wallet was not charged.');
  }

  // Debug-only "dummy gateway": credits the wallet through the same server logic
  // a real payment uses, so the offer → celebration → bonus loop can be tested
  // before Razorpay keys exist. Server-guarded by config/global.devPaymentsEnabled.
  Future<void> _simulatePay() async {
    final plan = _selected;
    if (plan == null) return;
    setState(() => _processing = true);
    try {
      await ref.read(functionsProvider).httpsCallable('simulateRechargeSelf').call({
        'planId': plan.id,
        if (_coupon != null) 'couponId': _coupon!.couponId,
      });
      if (!mounted) return;
      setState(() => _processing = false);
      ref.read(analyticsProvider).logEvent(AnalyticsEvents.rechargeSuccess, params: {
        'planId': plan.id, 'amount': plan.amount, 'simulated': 1,
      },);
      _showSuccess(plan);
    } catch (e) {
      // Be honest when the test top-up doesn't actually reach the server — a
      // fake "success" here masks a failed call and a wallet that never moved.
      if (!mounted) return;
      setState(() => _processing = false);
      debugPrint('simulateRechargeSelf failed: $e');
      _snack('Test top-up couldn\'t reach the server — wallet not credited.');
    }
  }

  void _showSuccess(RechargePlan plan) {
    final couponBonus = _coupon?.discountPaise ?? 0;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => _RechargeCelebration(
        plan: plan,
        couponBonus: couponBonus,
        onDone: () {
          Navigator.pop(context); // close dialog
          Navigator.of(context).maybePop(); // leave recharge screen
        },
      ),
    );
  }

  void _snack(String msg) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

  /// Prominent wallet-balance section at the top of the recharge body.
  Widget _walletBalanceCard(int balance) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF5A4A1E), Color(0xFF20190F)],
          ),
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
                color: const Color(0xFF20190F).withValues(alpha: 0.28),
                blurRadius: 18,
                offset: const Offset(0, 8),),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(12),),
              child: const Icon(Icons.account_balance_wallet_rounded, color: Colors.white),
            ),
            const SizedBox(width: 14),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('WALLET BALANCE',
                    style: Ob.note.copyWith(color: const Color(0xFFFFD98A), fontSize: 10, letterSpacing: 1),),
                const SizedBox(height: 2),
                Text(Money.formatPaise(balance),
                    style: Ob.title.copyWith(color: Colors.white, fontSize: 24),),
              ],
            ),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final plans = ref.watch(_plansProvider);
    final balance = ref.watch(myProfileProvider).valueOrNull?.spendablePaise ?? 0;
    return Scaffold(
      backgroundColor: Ob.bgColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Ob.navy,
        title: Text('Add Cash', style: Ob.title.copyWith(fontSize: 22)),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                decoration: BoxDecoration(color: Ob.lavenderChip, borderRadius: BorderRadius.circular(14)),
                child: Row(
                  children: [
                    const Icon(Icons.account_balance_wallet_rounded, size: 16, color: Ob.purple),
                    const SizedBox(width: 6),
                    Text(Money.formatPaise(balance),
                        style: Ob.option.copyWith(fontSize: 13, fontWeight: FontWeight.w600, color: Ob.purple),),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      body: Stack(
        children: [
          plans.when(
            loading: () => const Center(child: CircularProgressIndicator(color: Ob.purple)),
            error: (_, __) => const ErrorStateView(),
            data: (list) {
              if (list.isEmpty) {
                return const EmptyState(
                  icon: Icons.account_balance_wallet_outlined,
                  title: 'No recharge amounts available',
                  message: 'Please check back shortly.',
                );
              }
              // When opened from a Recharge banner, lock the screen to that one
              // plan so the user pays exactly the promoted amount (no switching).
              // Otherwise show only Regular plans — Offer plans are banner-only.
              final wanted = widget.preselectPlanId;
              final offerMode = wanted != null && wanted.isNotEmpty && list.any((p) => p.id == wanted);
              final shown = offerMode
                  ? list.where((p) => p.id == wanted).toList()
                  : list.where((p) => !p.isOffer).toList();
              // Promo amount-lock: a coupon/banner/push says “recharge exactly ₹X”.
              // Every tile is shown, but only the tile matching that amount stays
              // tappable — the rest are frozen. Offers are never self-serve.
              final lock = widget.lockAmountPaise;
              final lockMode = !offerMode && lock != null && lock > 0 && shown.any((p) => p.amount == lock);
              if ((offerMode || lockMode) && !_appliedPreselect) {
                _appliedPreselect = true;
                final picked = offerMode ? shown.first : shown.firstWhere((p) => p.amount == lock);
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (!mounted) return;
                  setState(() => _selected = picked);
                  if (_couponCtrl.text.trim().isNotEmpty) _applyCoupon();
                });
              }
              return Column(
                children: [
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
                      children: [
                        _walletBalanceCard(balance),
                        const SizedBox(height: 18),
                        if (!offerMode && !lockMode) ...[
                          _offersBanner(),
                          const SizedBox(height: 20),
                        ],
                        Row(
                          children: [
                            const Icon(Icons.auto_awesome, color: Ob.gold, size: 16),
                            const SizedBox(width: 6),
                            Text((offerMode || lockMode) ? 'Your exclusive offer' : 'Choose an amount to add', style: Ob.sectionLabel),
                          ],
                        ),
                        if (lockMode) ...[
                          const SizedBox(height: 6),
                          Text('This offer applies only to ${Money.formatPaise(lock)}. Other amounts are locked.',
                              style: Ob.option.copyWith(color: Ob.navy.withValues(alpha: 0.6), fontSize: 12),),
                        ],
                        const SizedBox(height: 16),
                        LayoutBuilder(builder: (context, c) {
                          const spacing = 12.0;
                          final w = offerMode ? c.maxWidth : (c.maxWidth - spacing * 2) / 3;
                          return Wrap(
                            spacing: spacing,
                            runSpacing: spacing,
                            children: [for (final p in shown) _tile(p, w, frozen: lockMode && p.amount != lock)],
                          );
                        },),
                      ],
                    ),
                  ),
                  Padding(
                    // Bottom-safe so the Proceed button clears the gesture bar.
                    padding: EdgeInsets.fromLTRB(20, 4, 20, 16 + MediaQuery.of(context).padding.bottom),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _couponBar(),
                        const SizedBox(height: 12),
                        GoldButton(
                          label: _selected == null
                              ? 'Select an amount'
                              : 'Proceed  •  ${Money.formatPaise(_selected!.amount)}',
                          icon: null,
                          loading: _processing,
                          onPressed: (_selected == null || _processing) ? null : _startRecharge,
                        ),
                        if (kDebugMode && _selected != null)
                          TextButton(
                            onPressed: _processing ? null : _simulatePay,
                            child: const Text('Simulate payment (test)'),
                          ),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
          if (_processing) const LoadingOverlay(message: 'Starting secure payment…'),
        ],
      ),
    );
  }

  Widget _couponBar() {
    // Applied state: green success chip with a Remove action.
    if (_coupon != null) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFFEAF7EF),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFF66BB8A)),
        ),
        child: Row(
          children: [
            const Icon(Icons.check_circle_rounded, color: Color(0xFF2E9E5B), size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Coupon applied  •  +${Money.formatPaise(_coupon!.discountPaise)} bonus',
                style: Ob.option.copyWith(fontWeight: FontWeight.w700, color: const Color(0xFF1F7A47), fontSize: 13.5),
              ),
            ),
            GestureDetector(
              onTap: _processing ? null : _removeCoupon,
              child: Text('Remove', style: Ob.option.copyWith(color: Ob.purple, fontWeight: FontWeight.w600, fontSize: 13)),
            ),
          ],
        ),
      );
    }
    // Entry state: code field + Apply, an optional error, and a link to Offers.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Container(
                height: 46,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                decoration: BoxDecoration(
                  color: Ob.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: _couponError != null ? const Color(0xFFD9534F) : Ob.border),
                ),
                alignment: Alignment.center,
                child: TextField(
                  controller: _couponCtrl,
                  textCapitalization: TextCapitalization.characters,
                  onChanged: (v) {
                    final up = v.toUpperCase();
                    if (up != v) {
                      _couponCtrl.value = _couponCtrl.value.copyWith(
                        text: up,
                        selection: TextSelection.collapsed(offset: up.length),
                      );
                    }
                    if (_couponError != null) setState(() => _couponError = null);
                  },
                  decoration: const InputDecoration(
                    isCollapsed: true,
                    border: InputBorder.none,
                    hintText: 'Have a coupon code?',
                    icon: Icon(Icons.local_offer_outlined, size: 18, color: Ob.purple),
                  ),
                  style: Ob.option.copyWith(fontWeight: FontWeight.w600, letterSpacing: 0.5),
                ),
              ),
            ),
            const SizedBox(width: 10),
            SizedBox(
              height: 46,
              child: TextButton(
                onPressed: (_couponBusy || _processing) ? null : _applyCoupon,
                style: TextButton.styleFrom(
                  backgroundColor: Ob.lavenderChip,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(horizontal: 18),
                ),
                child: _couponBusy
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Ob.purple))
                    : Text('Apply', style: Ob.option.copyWith(color: Ob.purple, fontWeight: FontWeight.w700)),
              ),
            ),
          ],
        ),
        if (_couponError != null)
          Padding(
            padding: const EdgeInsets.only(top: 6, left: 4),
            child: Text(_couponError!, style: Ob.option.copyWith(color: const Color(0xFFD9534F), fontSize: 12)),
          ),
      ],
    );
  }

  // Prominent, full-width entry to the Offers screen — placed at the top of the
  // amount list so every user sees it the moment they open Add Cash.
  Widget _offersBanner() => GestureDetector(
        onTap: () => context.push('/offers'),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            gradient: Ob.goldGradient,
            borderRadius: BorderRadius.circular(16),
            boxShadow: Ob.softShadow,
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.35), shape: BoxShape.circle),
                child: const Text('🎁', style: TextStyle(fontSize: 20)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('View all offers', style: Ob.title.copyWith(color: Ob.navy, fontSize: 16)),
                    const SizedBox(height: 2),
                    Text('Coupons & extra-bonus deals on your recharge',
                        style: Ob.option.copyWith(color: Ob.navy.withValues(alpha: 0.8), fontSize: 12),),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: Ob.navy),
            ],
          ),
        ),
      );

  Widget _tile(RechargePlan plan, double w, {bool frozen = false}) {
    final sel = _selected?.id == plan.id;
    // Frozen tiles belong to a promo that locks a different amount: shown so the
    // user sees the full menu, but greyed and un-tappable.
    if (frozen) {
      return Opacity(
        opacity: 0.45,
        child: Container(
          width: w,
          padding: const EdgeInsets.symmetric(vertical: 20),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: Ob.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Ob.border),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.lock_outline_rounded, size: 14, color: Ob.navy),
              const SizedBox(width: 5),
              Text(Money.formatPaise(plan.amount), style: Ob.title.copyWith(fontSize: 20)),
            ],
          ),
        ),
      );
    }
    return GestureDetector(
      onTap: () {
        setState(() => _selected = plan);
        // Re-validate an entered/applied coupon against the newly chosen amount.
        if (_couponCtrl.text.trim().isNotEmpty) _applyCoupon();
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        width: w,
        padding: const EdgeInsets.symmetric(vertical: 20),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: sel ? Ob.selectedFill : Ob.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: sel ? Ob.selectedBorder : Ob.border, width: sel ? 1.6 : 1),
          boxShadow: sel ? null : Ob.softShadow,
        ),
        child: Text(Money.formatPaise(plan.amount), style: Ob.title.copyWith(fontSize: 20)),
      ),
    );
  }
}

/// A sparkle burst point around the gift.
class _Spark {
  const _Spark(this.dx, this.dy, this.size, this.delay, this.gold);
  final double dx;
  final double dy;
  final double size;
  final double delay;
  final bool gold;
}

const _sparkles = <_Spark>[
  _Spark(-70, -40, 18, 0.30, true),
  _Spark(64, -30, 14, 0.38, true),
  _Spark(-58, 40, 13, 0.44, false),
  _Spark(72, 44, 16, 0.34, true),
  _Spark(0, -68, 15, 0.48, true),
  _Spark(-30, 60, 11, 0.52, false),
  _Spark(40, -60, 12, 0.42, false),
];

/// Celebratory recharge-success popup: the 3D gift pops in with an elastic
/// bounce, gold sparkles burst around it, and the bonus is called out by name.
class _RechargeCelebration extends StatefulWidget {
  const _RechargeCelebration({required this.plan, required this.onDone, this.couponBonus = 0});
  final RechargePlan plan;
  final int couponBonus; // extra paise bonus from an applied coupon
  final VoidCallback onDone;

  @override
  State<_RechargeCelebration> createState() => _RechargeCelebrationState();
}

class _RechargeCelebrationState extends State<_RechargeCelebration> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..forward();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  double _elastic(double v, double start, double end) {
    if (v <= start) return 0;
    final t = ((v - start) / (end - start)).clamp(0.0, 1.0);
    return Curves.elasticOut.transform(t);
  }

  Widget _sparkle(_Spark s) {
    final t = ((_c.value - s.delay) / 0.5).clamp(0.0, 1.0);
    final appear = Curves.easeOut.transform(t);
    return Positioned(
      left: 100 + s.dx,
      top: 85 + s.dy,
      child: Opacity(
        opacity: appear,
        child: Transform.scale(
          scale: 0.4 + appear * 0.9,
          child: Icon(Icons.auto_awesome,
              size: s.size, color: s.gold ? const Color(0xFFFFE9B8) : Colors.white,),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final plan = widget.plan;
    final bonus = plan.bonus + widget.couponBonus;
    return Dialog(
      backgroundColor: Ob.bgColor,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 32),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              height: 172,
              width: 200,
              child: AnimatedBuilder(
                animation: _c,
                builder: (context, _) {
                  final giftScale = _elastic(_c.value, 0.0, 0.65);
                  return Stack(
                    alignment: Alignment.center,
                    clipBehavior: Clip.none,
                    children: [
                      Opacity(
                        opacity: (_c.value * 1.4).clamp(0.0, 1.0),
                        child: Container(
                          width: 170,
                          height: 170,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: RadialGradient(
                              colors: [Color(0x66FFD98A), Color(0x1FFFD98A), Color(0x00FFD98A)],
                              stops: [0.0, 0.55, 1.0],
                            ),
                          ),
                        ),
                      ),
                      for (final s in _sparkles) _sparkle(s),
                      Transform.scale(scale: giftScale, child: Image.asset(Ob.gift, height: 120)),
                    ],
                  );
                },
              ),
            ),
            const SizedBox(height: 2),
            Text('Congratulations! 🎉', style: Ob.title.copyWith(fontSize: 26), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text('${Money.formatPaise(plan.walletCredit)} added to your wallet',
                style: Ob.subtitle, textAlign: TextAlign.center,),
            if (bonus > 0) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
                decoration: BoxDecoration(gradient: Ob.goldGradient, borderRadius: BorderRadius.circular(999)),
                child: Text('🎁  +${Money.formatPaise(bonus)} bonus unlocked!',
                    style: Ob.option.copyWith(color: Ob.navy, fontWeight: FontWeight.w700, fontSize: 13.5),),
              ),
            ],
            const SizedBox(height: 22),
            GoldButton(label: 'Awesome!', icon: null, onPressed: widget.onDone),
          ],
        ),
      ),
    );
  }
}
