import 'package:flutter/material.dart';
import 'package:shared_flutter/shared_flutter.dart';

/// Splash: white background, animated purple logo, ≤2s, then the router
/// redirect takes over based on auth/onboarding state (Part 3).
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: FadeTransition(
          opacity: _c,
          child: ScaleTransition(
            scale: CurvedAnimation(parent: _c, curve: Curves.easeOutBack),
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: AppSpacing.xxl),
              child: AppLogo(height: 96),
            ),
          ),
        ),
      ),
    );
  }
}
