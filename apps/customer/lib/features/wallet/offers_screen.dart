import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../profile_setup/onboarding_style.dart';
import '../profile_setup/onboarding_widgets.dart';

final _couponsProvider = StreamProvider.autoDispose<List<Coupon>>(
    (ref) => ref.watch(catalogRepositoryProvider).watchCoupons());

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

  Color _hex(String? s, Color fallback) {
    if (s == null || s.isEmpty) return fallback;
    var h = s.replaceFirst('#', '');
    if (h.length == 6) h = 'FF$h';
    final v = int.tryParse(h, radix: 16);
    return v == null ? fallback : Color(v);
  }

  @override
  Widget build(BuildContext context) {
    final bg = _hex(coupon.bgColor, Ob.purple);
    final fg = _hex(coupon.textColor, Colors.white);
    final title = coupon.title.isNotEmpty ? coupon.title : 'Wallet offer';
    final body = coupon.description.isNotEmpty
        ? coupon.description
        : 'Get ${Money.formatPaise(coupon.amount)}${coupon.bonus > 0 ? ' + ${Money.formatPaise(coupon.bonus)} bonus' : ''} in your wallet';

    return GestureDetector(
      onTap: () => context.push('/recharge?coupon=${Uri.encodeComponent(coupon.code)}'),
      child: Container(
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(20),
          boxShadow: Ob.softShadow,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: Ob.title.copyWith(color: fg, fontSize: 19)),
                        const SizedBox(height: 6),
                        Text(body, style: Ob.subtitle.copyWith(color: fg.withOpacity(0.9), fontSize: 13.5)),
                        if (coupon.minimumRecharge > 0) ...[
                          const SizedBox(height: 6),
                          Text('On recharge of ${Money.formatPaise(coupon.minimumRecharge)} or more',
                              style: Ob.option.copyWith(color: fg.withOpacity(0.75), fontSize: 11.5)),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(gradient: Ob.goldGradient, borderRadius: BorderRadius.circular(12)),
                    child: Column(
                      children: [
                        Text('+${Money.formatPaise(coupon.reward)}',
                            style: Ob.title.copyWith(color: Ob.navy, fontSize: 16)),
                        Text('reward', style: Ob.option.copyWith(color: Ob.navy, fontSize: 10, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            // Dashed tear-line + code footer.
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.12),
                borderRadius: const BorderRadius.only(
                  bottomLeft: Radius.circular(20),
                  bottomRight: Radius.circular(20),
                ),
              ),
              child: Row(
                children: [
                  Icon(Icons.confirmation_number_outlined, color: fg, size: 18),
                  const SizedBox(width: 8),
                  Text(coupon.code,
                      style: Ob.option.copyWith(color: fg, fontWeight: FontWeight.w800, letterSpacing: 1.5, fontSize: 15)),
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
            ),
          ],
        ),
      ),
    );
  }
}
