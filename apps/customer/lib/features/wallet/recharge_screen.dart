import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../data/messaging_service.dart';
import '../profile_setup/onboarding_style.dart';
import '../profile_setup/onboarding_widgets.dart';

final _plansProvider = StreamProvider.autoDispose<List<RechargePlan>>(
    (ref) => ref.watch(catalogRepositoryProvider).watchPlans());

/// "Add Cash" — pick an amount, then pay via Razorpay. The wallet is credited
/// server-side (Cloud Function) on payment verification.
class RechargeScreen extends ConsumerStatefulWidget {
  const RechargeScreen({super.key, this.preselectPlanId});

  /// When opened from a Recharge banner (/recharge?plan=<id>), the matching
  /// plan is pre-selected so the user can pay in one tap.
  final String? preselectPlanId;

  @override
  ConsumerState<RechargeScreen> createState() => _RechargeScreenState();
}

class _RechargeScreenState extends ConsumerState<RechargeScreen> {
  late final Razorpay _razorpay;
  RechargePlan? _selected;
  RechargeOrder? _order;
  bool _processing = false;
  bool _appliedPreselect = false;

  @override
  void initState() {
    super.initState();
    _razorpay = Razorpay()
      ..on(Razorpay.EVENT_PAYMENT_SUCCESS, _onSuccess)
      ..on(Razorpay.EVENT_PAYMENT_ERROR, _onError)
      ..on(Razorpay.EVENT_EXTERNAL_WALLET, (_) {});
  }

  @override
  void dispose() {
    _razorpay.clear();
    super.dispose();
  }

  Future<void> _startRecharge() async {
    final plan = _selected;
    if (plan == null) return;
    setState(() => _processing = true);
    final res = await ref.read(walletServiceProvider).createOrder(plan.id);
    if (!mounted) return;
    res.when(
      success: (order) {
        _order = order;
        _razorpay.open({
          'key': order.keyId,
          'order_id': order.orderId,
          'amount': order.amount,
          'currency': order.currency,
          'name': 'ASKTRO',
          'description': 'Wallet recharge',
          'prefill': {'contact': ref.read(myProfileProvider).valueOrNull?.phone ?? ''},
          'theme': {'color': '#7E57C2'},
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
        );
    if (!mounted) return;
    setState(() => _processing = false);
    res.when(
      success: (_) {
        ref.read(analyticsProvider).logEvent(AnalyticsEvents.rechargeSuccess, params: {
          'planId': plan.id,
          'amount': plan.amount,
        });
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
      await ref.read(functionsProvider).httpsCallable('simulateRechargeSelf').call({'planId': plan.id});
      if (!mounted) return;
      setState(() => _processing = false);
      ref.read(analyticsProvider).logEvent(AnalyticsEvents.rechargeSuccess, params: {
        'planId': plan.id, 'amount': plan.amount, 'simulated': true,
      });
      _showSuccess(plan);
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      setState(() => _processing = false);
      _snack(e.message ?? 'Simulated payment failed');
    }
  }

  void _showSuccess(RechargePlan plan) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => _RechargeCelebration(
        plan: plan,
        onDone: () {
          Navigator.pop(context); // close dialog
          Navigator.of(context).maybePop(); // leave recharge screen
        },
      ),
    );
  }

  void _snack(String msg) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

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
                        style: Ob.option.copyWith(fontSize: 13, fontWeight: FontWeight.w600, color: Ob.purple)),
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
              final wanted = widget.preselectPlanId;
              final offerMode = wanted != null && wanted.isNotEmpty && list.any((p) => p.id == wanted);
              final shown = offerMode ? list.where((p) => p.id == wanted).toList() : list;
              if (offerMode && !_appliedPreselect) {
                _appliedPreselect = true;
                final picked = shown.first;
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (mounted) setState(() => _selected = picked);
                });
              }
              return Column(
                children: [
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.auto_awesome, color: Ob.gold, size: 16),
                            const SizedBox(width: 6),
                            Text(offerMode ? 'Your exclusive offer' : 'Choose an amount to add', style: Ob.sectionLabel),
                          ],
                        ),
                        const SizedBox(height: 16),
                        LayoutBuilder(builder: (context, c) {
                          const spacing = 12.0;
                          final w = offerMode ? c.maxWidth : (c.maxWidth - spacing * 2) / 3;
                          return Wrap(
                            spacing: spacing,
                            runSpacing: spacing,
                            children: [for (final p in shown) _tile(p, w)],
                          );
                        }),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
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

  Widget _tile(RechargePlan plan, double w) {
    final sel = _selected?.id == plan.id;
    return GestureDetector(
      onTap: () => setState(() => _selected = plan),
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
  const _RechargeCelebration({required this.plan, required this.onDone});
  final RechargePlan plan;
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
              size: s.size, color: s.gold ? const Color(0xFFF3D97C) : Colors.white),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final plan = widget.plan;
    final bonus = plan.bonus;
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
                              colors: [Color(0x66EAD079), Color(0x1FEAD079), Color(0x00EAD079)],
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
                style: Ob.subtitle, textAlign: TextAlign.center),
            if (bonus > 0) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
                decoration: BoxDecoration(gradient: Ob.goldGradient, borderRadius: BorderRadius.circular(999)),
                child: Text('🎁  +${Money.formatPaise(bonus)} bonus unlocked!',
                    style: Ob.option.copyWith(color: Ob.navy, fontWeight: FontWeight.w700, fontSize: 13.5)),
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
