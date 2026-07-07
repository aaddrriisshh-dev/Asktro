import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';

/// Renders an admin-managed CMS page (privacy/terms/about/faq) from `cms/{page}`.
/// Content is editable in the admin portal without shipping an app update.
final _cmsProvider = FutureProvider.autoDispose.family<String, String>((ref, page) async {
  final doc = await ref.watch(firestoreProvider).collection('cms').doc(page).get();
  return (doc.data()?['content'] as String?) ?? '';
});

class CmsViewerScreen extends ConsumerWidget {
  const CmsViewerScreen({super.key, required this.page, required this.title});
  final String page;
  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_cmsProvider(page));
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (_, __) => const ErrorStateView(),
        data: (content) => content.trim().isEmpty
            ? const EmptyState(
                icon: Icons.description_outlined,
                title: 'Nothing here yet',
                message: 'This page has not been published.',
              )
            : SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(AppSpacing.xl, AppSpacing.xl, AppSpacing.xl,
                    AppSpacing.xl + MediaQuery.of(context).padding.bottom),
                child: Text(content, style: AppTypography.body),
              ),
      ),
    );
  }
}
