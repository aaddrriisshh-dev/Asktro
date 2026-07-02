import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../data/messaging_service.dart';

final _plansProvider = StreamProvider.autoDispose<List<RechargePlan>>(
    (ref) => ref.watch(catalogRepositoryProvider).watchPlans());

class RechargeScreen extends ConsumerStatefulWidget {
  const RechargeScreen({super.key});

  @override
  ConsumerState<RechargeScreen> createState() => _RechargeScreenState();
}

class _RechargeScreenState extends ConsumerState<RechargeScreen> {
  late final Razorpay _razorpay;
  RechargePlan? _pending;
  RechargeOrder? _order;
  bool _processing = false;
  final _coupon = TextEditingController();
  String? _couponId;
  int _couponDiscount = 0;
  String? _couponMsg;

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
    _coupon.dispose();
    super.dispose();
  }

  Future<void> _applyCoupon(RechargePlan plan) async {
    final code = _coupon.text.trim();
    if (code.isEmpty) return;
    final res = await ref.read(walletServiceProvider).validateCoupon(code, planId: plan.id);
    if (!mounted) return;
    res.when(
      success: (v) {
        setState(() {
          _couponId = v.couponId;
          _couponDiscount = v.discountPaise;
          _couponMsg = 'Coupon applied: ${Money.formatPaise(v.discountPaise)} extra credit';
        });
        ref.read(analyticsProvider).logEvent(AnalyticsEvents.couponUsed, params: {'code': code});
      },
      failure: (f) => setState(() {
        _couponId = null;
        _couponDiscount = 0;
        _couponMsg = f.message;
      }),
    );
  }

  Future<void> _startRecharge(RechargePlan plan) async {
    setState(() {
      _processing = true;
      _pending = plan;
    });
    final res = await ref.read(walletServiceProvider).createOrder(plan.id, couponId: _couponId);
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
    final plan = _pending;
    if (order == null || plan == null) return;
    final res = await ref.read(walletServiceProvider).verify(
          orderId: order.orderId,
          paymentId: r.paymentId ?? '',
          signature: r.signature ?? '',
          planId: plan.id,
          couponId: _couponId,
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
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.dialog)),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircleAvatar(
                radius: 34,
                backgroundColor: AppColors.success,
                child: Icon(Icons.check_rounded, color: Colors.white, size: 40),
              ),
              const SizedBox(height: AppSpacing.lg),
              Text('Recharge successful', style: AppTypography.subtitle),
              const SizedBox(height: AppSpacing.xs),
              Text('${Money.formatPaise(plan.totalCredit)} added to your wallet.',
                  style: AppTypography.caption, textAlign: TextAlign.center),
              const SizedBox(height: AppSpacing.xl),
              PrimaryButton(
                label: 'Done',
                onPressed: () {
                  Navigator.of(context).pop();
                  Navigator.of(context).maybePop();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _snack(String msg) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

  @override
  Widget build(BuildContext context) {
    final plans = ref.watch(_plansProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Recharge')),
      body: Stack(
        children: [
          plans.when(
            loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
            error: (_, __) => const ErrorStateView(),
            data: (list) {
              if (list.isEmpty) {
                return const EmptyState(
                  icon: Icons.account_balance_wallet_outlined,
                  title: 'No recharge plans available',
                  message: 'Please check back shortly.',
                );
              }
              return ListView(
                padding: const EdgeInsets.all(AppSpacing.lg),
                children: [
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _coupon,
                                textCapitalization: TextCapitalization.characters,
                                decoration: const InputDecoration(
                                  hintText: 'Have a coupon code?',
                                  filled: false,
                                  border: InputBorder.none,
                                ),
                              ),
                            ),
                            TextButton(
                              onPressed: () => _applyCoupon(list.first),
                              child: const Text('Apply'),
                            ),
                          ],
                        ),
                        if (_couponMsg != null)
                          Text(_couponMsg!,
                              style: AppTypography.caption.copyWith(
                                  color: _couponId != null ? AppColors.success : AppColors.error)),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  for (final plan in list) ...[
                    _PlanCard(plan: plan, onTap: _processing ? null : () => _startRecharge(plan)),
                    const SizedBox(height: AppSpacing.md),
                  ],
                ],
              );
            },
          ),
          if (_processing) const LoadingOverlay(message: 'Starting secure payment…'),
        ],
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.plan, required this.onTap});
  final RechargePlan plan;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: onTap,
      child: Row(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(Money.formatPaise(plan.amount), style: AppTypography.title),
              if (plan.bonus > 0)
                Text('+ ${Money.formatPaise(plan.bonus)} bonus',
                    style: AppTypography.caption.copyWith(color: AppColors.success)),
            ],
          ),
          const Spacer(),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Row(
                children: [
                  if (plan.recommended) const LabelBadge(text: 'Recommended'),
                  if (plan.popular) ...[
                    const SizedBox(width: 6),
                    const LabelBadge(text: 'Popular', filled: false),
                  ],
                ],
              ),
              const SizedBox(height: 6),
              Text('Get ${Money.formatPaise(plan.totalCredit)}',
                  style: AppTypography.body.copyWith(fontWeight: FontWeight.w600)),
            ],
          ),
        ],
      ),
    );
  }
}
