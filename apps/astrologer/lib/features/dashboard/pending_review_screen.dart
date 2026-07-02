import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';

/// Shown when the astrologer account is not yet approved (Part 5).
class PendingReviewScreen extends ConsumerWidget {
  const PendingReviewScreen({super.key, required this.status});
  final AstrologerStatus? status;

  String get _message => switch (status) {
        AstrologerStatus.suspended => 'Your account has been suspended. Please contact the ASKTRO team.',
        AstrologerStatus.rejected => 'Your application was not approved at this time.',
        AstrologerStatus.disabled => 'Your account is currently disabled.',
        _ => "Your account is under review. We'll notify you once verification is complete.",
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 120,
                height: 120,
                decoration: const BoxDecoration(gradient: AppColors.lavenderGradient, shape: BoxShape.circle),
                child: const Icon(Icons.verified_user_outlined, size: 56, color: AppColors.primary),
              ),
              const SizedBox(height: AppSpacing.xl),
              Text('Account under review', style: AppTypography.title, textAlign: TextAlign.center),
              const SizedBox(height: AppSpacing.sm),
              Text(_message, style: AppTypography.body.copyWith(color: AppColors.textSecondary), textAlign: TextAlign.center),
              const SizedBox(height: AppSpacing.xxl),
              SecondaryButton(
                label: 'Log out',
                icon: Icons.logout_rounded,
                onPressed: () => ref.read(firebaseAuthProvider).signOut(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
