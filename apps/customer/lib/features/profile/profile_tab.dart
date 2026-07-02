import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../auth/auth_controller.dart';

class ProfileTab extends ConsumerWidget {
  const ProfileTab({super.key});

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete account?'),
        content: const Text(
            'This permanently removes your profile and data. Active consultations must be finished first.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          DestructiveButton(label: 'Delete', onPressed: () => Navigator.pop(context, true)),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(functionsProvider).httpsCallable('deleteAccount').call();
      await ref.read(authControllerProvider).signOut();
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Could not delete account. Please try again.')));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(myProfileProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          Row(
            children: [
              AppAvatar(name: profile?.name ?? 'You', photoUrl: profile?.profilePhoto, size: 64),
              const SizedBox(width: AppSpacing.lg),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(profile?.name ?? 'You', style: AppTypography.subtitle),
                    Text(profile?.phone ?? '', style: AppTypography.caption),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xl),
          if (profile != null)
            AppCard(
              child: Row(
                children: [
                  const Icon(Icons.card_giftcard_rounded, color: AppColors.primary),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Your referral code', style: AppTypography.caption),
                        Text(profile.referralCode,
                            style: AppTypography.subtitle.copyWith(color: AppColors.primary)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: AppSpacing.lg),
          _tile(Icons.notifications_outlined, 'Notification preferences'),
          _tile(Icons.help_outline_rounded, 'Help & Support'),
          _tile(Icons.privacy_tip_outlined, 'Privacy Policy'),
          _tile(Icons.description_outlined, 'Terms of Service'),
          _tile(Icons.info_outline_rounded, 'About ASKTRO'),
          const SizedBox(height: AppSpacing.lg),
          SecondaryButton(
            label: 'Log out',
            icon: Icons.logout_rounded,
            onPressed: () => ref.read(authControllerProvider).signOut(),
          ),
          const SizedBox(height: AppSpacing.md),
          Center(
            child: TextButton(
              onPressed: () => _confirmDelete(context, ref),
              child: Text('Delete account', style: AppTypography.caption.copyWith(color: AppColors.error)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tile(IconData icon, String label) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
        child: AppCard(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
          child: Row(
            children: [
              Icon(icon, color: AppColors.primary),
              const SizedBox(width: AppSpacing.md),
              Expanded(child: Text(label, style: AppTypography.body)),
              const Icon(Icons.chevron_right_rounded, color: AppColors.textSecondary),
            ],
          ),
        ),
      );
}
