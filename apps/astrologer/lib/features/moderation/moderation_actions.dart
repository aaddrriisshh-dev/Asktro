import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';

/// Reusable "Report / Block" overflow menu backed by the moderation Cloud
/// Functions (`reportContent`, `blockUser`). Lets an astrologer report or block
/// an abusive customer (Apple/Play UGC safety requirement). Self-contained.
class ModerationMenu extends ConsumerWidget {
  const ModerationMenu({
    super.key,
    required this.targetId,
    required this.targetLabel,
    this.consultationId,
    this.iconColor,
  });

  final String targetId;
  final String targetLabel;
  final String? consultationId;
  final Color? iconColor;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return PopupMenuButton<String>(
      icon: Icon(Icons.more_vert, color: iconColor),
      tooltip: 'More options',
      onSelected: (v) {
        if (v == 'report') _report(context, ref);
        if (v == 'block') _block(context, ref);
      },
      itemBuilder: (_) => [
        PopupMenuItem(value: 'report', child: Text('Report $targetLabel')),
        PopupMenuItem(value: 'block', child: Text('Block $targetLabel')),
      ],
    );
  }

  Future<void> _report(BuildContext context, WidgetRef ref) async {
    const reasons = ['abuse', 'harassment', 'nudity', 'spam', 'scam', 'fraud', 'other'];
    var reason = reasons.first;
    final detail = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: Text('Report $targetLabel'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButton<String>(
                isExpanded: true,
                value: reason,
                items: reasons
                    .map((r) => DropdownMenuItem(value: r, child: Text('${r[0].toUpperCase()}${r.substring(1)}')))
                    .toList(),
                onChanged: (v) => setState(() => reason = v ?? reasons.first),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: detail,
                maxLines: 3,
                decoration: const InputDecoration(hintText: 'Add details (optional)'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Submit')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(functionsProvider).httpsCallable('reportContent').call<Map<String, dynamic>>({
        'reportedId': targetId,
        'reason': reason,
        'detail': detail.text.trim(),
        if (consultationId != null) 'consultationId': consultationId,
      });
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Report submitted. Our team will review it.')));
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Could not submit the report. Please try again.')));
      }
    }
  }

  Future<void> _block(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Block $targetLabel?'),
        content: Text('You will no longer be matched with or able to chat with this $targetLabel.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Block')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(functionsProvider).httpsCallable('blockUser').call<Map<String, dynamic>>({'targetId': targetId});
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('${targetLabel[0].toUpperCase()}${targetLabel.substring(1)} blocked.')));
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Could not block. Please try again.')));
      }
    }
  }
}
