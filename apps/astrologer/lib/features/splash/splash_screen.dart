import 'package:flutter/material.dart';
import 'package:shared_flutter/shared_flutter.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 104,
              height: 104,
              decoration: const BoxDecoration(gradient: AppColors.primaryGradient, shape: BoxShape.circle),
              child: const Icon(Icons.auto_awesome, color: Colors.white, size: 52),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text('ASKTRO', style: AppTypography.headline.copyWith(letterSpacing: 2, color: AppColors.primary)),
            Text('for Astrologers', style: AppTypography.caption),
          ],
        ),
      ),
    );
  }
}
