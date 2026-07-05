import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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

  void _showSuccess(RechargePlan plan) {
    showDialog(
      context: context,
      builder: (_) => Dialog(
        backgroundColor: Ob.bgColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                alignment: Alignment.center,
                decoration: const BoxDecoration(gradient: Ob.goldCircle, shape: BoxShape.circle),
                child: const Icon(Icons.check_rounded, color: Colors.white, size: 34),
              ),
              const SizedBox(height: 16),
              Text('Recharge successful', style: Ob.title),
              const SizedBox(height: 6),
              Text('${Money.formatPaise(plan.totalCredit)} added to your wallet.',
                  style: Ob.subtitle, textAlign: TextAlign.center),
              const SizedBox(height: 20),
              GoldButton(
                label: 'Done',
                icon: null,
                onPressed: () {
                  Navigator.pop(context);
                  Navigator.of(context).maybePop();
                },
              ),
            ],
          ),
        ),
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
              // Pre-select the banner's plan once, after the first frame.
              final wanted = widget.preselectPlanId;
              if (!_appliedPreselect && wanted != null && wanted.isNotEmpty) {
                _appliedPreselect = true;
                RechargePlan? match;
                for (final p in list) {
                  if (p.id == wanted) { match = p; break; }
                }
                if (match != null) {
                  final picked = match;
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (mounted) setState(() => _selected = picked);
                  });
                }
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
                            Text('Choose an amount to add', style: Ob.sectionLabel),
                          ],
                        ),
                        const SizedBox(height: 16),
                        LayoutBuilder(builder: (context, c) {
                          const spacing = 12.0;
                          final w = (c.maxWidth - spacing * 2) / 3;
                          return Wrap(
                            spacing: spacing,
                            runSpacing: spacing,
                            children: [for (final p in list) _tile(p, w)],
                          );
                        }),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
                    child: GoldButton(
                      label: _selected == null
                          ? 'Select an amount'
                          : 'Proceed  •  ${Money.formatPaise(_selected!.amount)}',
                      icon: null,
                      loading: _processing,
                      onPressed: (_selected == null || _processing) ? null : _startRecharge,
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
