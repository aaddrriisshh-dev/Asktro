import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/router.dart';

class _Page {
  const _Page(this.icon, this.title, this.body);
  final IconData icon;
  final String title;
  final String body;
}

const _pages = [
  _Page(Icons.chat_bubble_outline_rounded, 'Talk to Trusted Astrologers',
      'Get instant guidance from verified professional astrologers through chat, voice and video consultations.'),
  _Page(Icons.account_balance_wallet_outlined, 'Recharge & Consult Anytime',
      'A simple wallet with secure payments and instant consultations, whenever you need clarity.'),
  _Page(Icons.lock_outline_rounded, 'Private & Secure',
      'Every consultation is private, encrypted and completely secure.'),
];

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _controller = PageController();
  int _index = 0;

  bool get _last => _index == _pages.length - 1;

  Future<void> _finish() async {
    await setOnboardingDone();
    ref.read(onboardingDoneProvider.notifier).state = true;
    if (mounted) context.go('/login');
  }

  void _next() {
    if (_last) {
      _finish();
    } else {
      _controller.nextPage(duration: AppSizes.pageAnim, curve: Curves.easeOut);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.topRight,
              child: TextButton(
                onPressed: _finish,
                child: Text('Skip', style: AppTypography.body.copyWith(color: AppColors.textSecondary)),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                onPageChanged: (i) => setState(() => _index = i),
                itemCount: _pages.length,
                itemBuilder: (_, i) {
                  final p = _pages[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 200,
                          height: 200,
                          decoration: const BoxDecoration(
                            gradient: AppColors.lavenderGradient,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(p.icon, size: 92, color: AppColors.primary),
                        ),
                        const SizedBox(height: AppSpacing.xxl),
                        Text(p.title, style: AppTypography.title, textAlign: TextAlign.center),
                        const SizedBox(height: AppSpacing.md),
                        Text(p.body, style: AppTypography.body.copyWith(color: AppColors.textSecondary),
                            textAlign: TextAlign.center),
                      ],
                    ),
                  );
                },
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(_pages.length, (i) {
                final active = i == _index;
                return AnimatedContainer(
                  duration: AppSizes.tapAnim,
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: active ? 22 : 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: active ? AppColors.primary : AppColors.secondary.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(4),
                  ),
                );
              }),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.xl),
              child: PrimaryButton(label: _last ? 'Get Started' : 'Next', onPressed: _next),
            ),
          ],
        ),
      ),
    );
  }
}
