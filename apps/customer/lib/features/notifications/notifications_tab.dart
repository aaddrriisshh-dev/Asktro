import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../consultation/chat_deeplink_screen.dart';
import '../profile/suggested_remedies_screen.dart';

final _notificationsProvider = StreamProvider.autoDispose<List<AppNotification>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref.watch(notificationRepositoryProvider).watch(uid);
});

class NotificationsTab extends ConsumerWidget {
  const NotificationsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_notificationsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (_, __) => const ErrorStateView(),
        data: (list) {
          if (list.isEmpty) {
            return const EmptyState(
              icon: Icons.notifications_none_rounded,
              title: 'You’re all caught up',
              message: 'Offers, recharge confirmations and updates will show up here.',
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(AppSpacing.lg),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
            itemBuilder: (_, i) {
              final n = list[i];
              return AppCard(
                color: n.read ? AppColors.card : AppColors.accentLavender,
                onTap: () {
                  ref.read(notificationRepositoryProvider).markRead(n.id);
                  final rid = n.remedyId;
                  if (rid != null && rid.isNotEmpty) {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => RemedyDetailScreen(data: {'id': rid}),
                      ),
                    );
                    return;
                  }
                  // A chat notification (e.g. "Guruji sent you a message") opens
                  // the conversation instead of just marking itself read.
                  final dl = n.deeplink ?? '';
                  if (dl.startsWith('asktro://chat/')) {
                    final cid = dl.substring('asktro://chat/'.length);
                    if (cid.isNotEmpty) {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => ChatDeepLinkScreen(consultationId: cid),
                        ),
                      );
                    }
                    return;
                  }
                  // Any other route deeplink ('/store', '/recharge', 'asktro://…')
                  // — follow it, so a plain/offer notification isn't a dead tap.
                  if (dl.startsWith('/')) {
                    context.push(dl);
                  } else if (dl.startsWith('asktro://')) {
                    context.push('/${dl.substring('asktro://'.length)}');
                  }
                },
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.campaign_outlined, color: AppColors.primary),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(n.title, style: AppTypography.body.copyWith(fontWeight: FontWeight.w600)),
                          const SizedBox(height: 2),
                          Text(n.body, style: AppTypography.caption),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}
