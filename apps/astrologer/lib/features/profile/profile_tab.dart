import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';

class ProfileTab extends ConsumerWidget {
  const ProfileTab({super.key});

  Future<void> _editAbout(BuildContext context, WidgetRef ref, Astrologer self) async {
    final controller = TextEditingController(text: self.about);
    final result = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Edit about'),
        content: TextField(controller: controller, maxLines: 5, decoration: const InputDecoration(hintText: 'Tell customers about yourself')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, controller.text), child: const Text('Save')),
        ],
      ),
    );
    if (result != null) {
      await ref.read(astrologerRepositoryProvider).updateProfile(self.id, {'about': result.trim()});
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final self = ref.watch(selfProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: self == null
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [
                Center(child: AppAvatar(name: self.name, photoUrl: self.profilePhoto, size: 96)),
                const SizedBox(height: AppSpacing.md),
                Center(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(self.name, style: AppTypography.title),
                      if (self.verified) ...[const SizedBox(width: 6), const VerifiedBadge(size: 18)],
                    ],
                  ),
                ),
                Center(child: Text('${self.experience}y experience', style: AppTypography.caption)),
                const SizedBox(height: AppSpacing.xl),
                AppCard(
                  onTap: () => _editAbout(context, ref, self),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('About', style: AppTypography.subtitle),
                          const Icon(Icons.edit_outlined, size: 18, color: AppColors.primary),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      Text(self.about.isEmpty ? 'Tap to add an introduction.' : self.about,
                          style: AppTypography.body.copyWith(color: AppColors.textSecondary)),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                if (self.languages.isNotEmpty) ...[
                  Text('Languages', style: AppTypography.subtitle),
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(spacing: 6, runSpacing: 6, children: self.languages.map((l) => TagChip(l)).toList()),
                  const SizedBox(height: AppSpacing.lg),
                ],
                if (self.expertise.isNotEmpty) ...[
                  Text('Expertise', style: AppTypography.subtitle),
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(spacing: 6, runSpacing: 6, children: self.expertise.map((e) => TagChip(e)).toList()),
                  const SizedBox(height: AppSpacing.xl),
                ],
                SecondaryButton(
                  label: 'Log out',
                  icon: Icons.logout_rounded,
                  onPressed: () => ref.read(firebaseAuthProvider).signOut(),
                ),
              ],
            ),
    );
  }
}
