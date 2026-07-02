import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../consultation/astrologer_consultation_screen.dart';

final _pendingProvider = StreamProvider.autoDispose<List<Consultation>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref.watch(astrologerRepositoryProvider).watchSessions(uid, statuses: ['waiting']);
});

final _activeProvider = StreamProvider.autoDispose<List<Consultation>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref.watch(astrologerRepositoryProvider).watchSessions(uid, statuses: ['active', 'paused']);
});

class HomeTab extends ConsumerWidget {
  const HomeTab({super.key});

  void _open(BuildContext context, Consultation c, Astrologer self) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => AstrologerConsultationScreen(consultationId: c.id, self: self),
    ));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final self = ref.watch(selfProvider).valueOrNull;
    final pending = ref.watch(_pendingProvider).valueOrNull ?? const [];
    final active = ref.watch(_activeProvider).valueOrNull ?? const [];
    final uid = ref.watch(currentUidProvider);

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          Row(
            children: [
              AppAvatar(name: self?.name ?? 'You', photoUrl: self?.profilePhoto, size: 52),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(self?.name ?? 'Astrologer', style: AppTypography.subtitle),
                    Text(self?.onlineStatus == true ? 'You are online' : 'You are offline',
                        style: AppTypography.caption.copyWith(
                            color: self?.onlineStatus == true ? AppColors.success : AppColors.textSecondary)),
                  ],
                ),
              ),
              Switch(
                value: self?.onlineStatus ?? false,
                activeTrackColor: AppColors.success,
                onChanged: uid == null
                    ? null
                    : (v) => ref.read(astrologerRepositoryProvider).setOnline(uid, v),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(child: _stat('Consultations', '${self?.totalConsultations ?? 0}')),
              const SizedBox(width: AppSpacing.md),
              Expanded(child: _stat('Rating', '${(self?.rating ?? 0).toStringAsFixed(1)}★')),
            ],
          ),
          if (active.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xl),
            Text('Active consultation', style: AppTypography.subtitle),
            const SizedBox(height: AppSpacing.sm),
            for (final c in active)
              AppCard(
                onTap: self == null ? null : () => _open(context, c, self),
                child: Row(
                  children: [
                    const Icon(Icons.bolt_rounded, color: AppColors.success),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(child: Text('${c.type.name} in progress', style: AppTypography.body)),
                    const Icon(Icons.chevron_right_rounded),
                  ],
                ),
              ),
          ],
          const SizedBox(height: AppSpacing.xl),
          Text('Incoming requests', style: AppTypography.subtitle),
          const SizedBox(height: AppSpacing.sm),
          if (pending.isEmpty)
            const EmptyState(
              icon: Icons.inbox_outlined,
              title: 'No new requests',
              message: 'Go online to start receiving consultation requests.',
            )
          else
            for (final c in pending)
              _RequestCard(
                consultation: c,
                onOpen: self == null ? null : () => _open(context, c, self),
              ),
        ],
      ),
    );
  }

  Widget _stat(String label, String value) => AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: AppTypography.caption),
            const SizedBox(height: 4),
            Text(value, style: AppTypography.title.copyWith(color: AppColors.primary)),
          ],
        ),
      );
}

class _RequestCard extends StatelessWidget {
  const _RequestCard({required this.consultation, required this.onOpen});
  final Consultation consultation;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: AppCard(
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(color: AppColors.accentLavender, shape: BoxShape.circle),
              child: const Icon(Icons.notifications_active_rounded, color: AppColors.primary),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('New ${consultation.type.name} request',
                      style: AppTypography.body.copyWith(fontWeight: FontWeight.w600)),
                  Text('₹9/min', style: AppTypography.caption),
                ],
              ),
            ),
            PrimaryButton(label: 'Open', expand: false, onPressed: onOpen),
          ],
        ),
      ),
    );
  }
}
