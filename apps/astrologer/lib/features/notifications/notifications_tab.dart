import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../ui/celestial.dart';

class NotificationsTab extends ConsumerWidget {
  const NotificationsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(notificationsProvider).valueOrNull ?? const <Map<String, dynamic>>[];
    final topPad = MediaQuery.of(context).padding.top;

    return SkyScaffold(
      child: ListView(
        padding: EdgeInsets.fromLTRB(16, topPad + 14, 16, 30),
        children: [
          Text('Notifications', style: Sky.h1),
          const SizedBox(height: 14),
          if (items.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 80),
              child: Column(
                children: [
                  const Icon(Icons.notifications_none_rounded, size: 46, color: Sky.ink3),
                  const SizedBox(height: 12),
                  Text('No notifications yet', style: Sky.h2.copyWith(fontSize: 15)),
                  const SizedBox(height: 4),
                  Text('Requests, payments and reviews will appear here.',
                      style: Sky.label.copyWith(fontSize: 12.5), textAlign: TextAlign.center,),
                ],
              ),
            )
          else
            for (final n in items)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _row(context, ref, n),
              ),
        ],
      ),
    );
  }

  ({IconData icon, Color color}) _visual(String type) {
    switch (type) {
      case 'payout':
      case 'payment':
        return (icon: Icons.payments_rounded, color: Sky.green);
      case 'withdrawal':
        return (icon: Icons.account_balance_rounded, color: Sky.purple);
      case 'review':
      case 'rating':
        return (icon: Icons.star_rounded, color: Sky.amber);
      case 'remedy_question':
        return (icon: Icons.self_improvement_rounded, color: Sky.gold);
      case 'consultation':
      case 'request':
        return (icon: Icons.chat_bubble_rounded, color: Sky.purple);
      default:
        return (icon: Icons.campaign_rounded, color: Sky.gold);
    }
  }

  Widget _row(BuildContext context, WidgetRef ref, Map<String, dynamic> n) {
    final type = (n['type'] ?? '') as String;
    final v = _visual(type);
    final read = n['read'] == true;
    final ts = n['createdAt'];
    final ms = ts is Timestamp ? ts.millisecondsSinceEpoch : null;
    final isQuestion = type == 'remedy_question' && (n['remedyId'] is String);

    final card = SkyCard(
      padding: const EdgeInsets.all(13),
      color: read ? Sky.card : Sky.surface,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: v.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
            child: Icon(v.icon, size: 19, color: v.color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text((n['title'] ?? 'Notification') as String, style: Sky.h2.copyWith(fontSize: 14)),
                if ((n['body'] ?? '').toString().isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(n['body'] as String, style: Sky.label.copyWith(fontSize: 12.5, height: 1.35)),
                ],
                if (isQuestion) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(Icons.reply_rounded, size: 14, color: Sky.purple),
                      const SizedBox(width: 5),
                      Text('Tap to reply', style: Sky.label.copyWith(fontSize: 12, color: Sky.purple, fontWeight: FontWeight.w700)),
                    ],
                  ),
                ],
                if (ms != null) ...[
                  const SizedBox(height: 5),
                  Text(_ago(ms), style: Sky.label.copyWith(fontSize: 11, color: Sky.ink3)),
                ],
              ],
            ),
          ),
          if (!read)
            Container(
              margin: const EdgeInsets.only(left: 6, top: 4),
              width: 8,
              height: 8,
              decoration: const BoxDecoration(color: Sky.gold, shape: BoxShape.circle),
            ),
        ],
      ),
    );

    if (!isQuestion) return card;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _openAnswer(context, ref, n),
      child: card,
    );
  }

  /// Opens a sheet showing the customer's question and lets the astrologer send
  /// a single reply, which lands back on the remedy for the customer to read.
  Future<void> _openAnswer(BuildContext context, WidgetRef ref, Map<String, dynamic> n) async {
    final remedyId = n['remedyId'] as String;
    final fs = ref.read(firestoreProvider);

    // Mark the notification read (best-effort) so the dot clears.
    if (n['read'] != true && n['id'] is String) {
      fs.collection('notifications').doc(n['id'] as String).update({'read': true}).catchError((_) {});
    }

    final snap = await fs.collection('remedies').doc(remedyId).get();
    if (!context.mounted) return;
    final r = snap.data() ?? const <String, dynamic>{};
    final question = (r['question'] ?? '') as String;
    final remTitle = (r['title'] ?? 'Remedy') as String;
    final alreadyAnswered = r['answered'] == true && (r['answer'] ?? '').toString().isNotEmpty;

    final ctrl = TextEditingController(text: alreadyAnswered ? (r['answer'] as String) : '');
    final text = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Sky.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(26))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 20, right: 20, top: 18, bottom: MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(Icons.self_improvement_rounded, size: 16, color: Sky.gold),
              const SizedBox(width: 7),
              Expanded(child: Text('Reply about "$remTitle"', style: Sky.h2, maxLines: 1, overflow: TextOverflow.ellipsis)),
            ],),
            const SizedBox(height: 12),
            // The customer's question.
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(13),
              decoration: BoxDecoration(color: Sky.surface, borderRadius: BorderRadius.circular(14)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('They asked', style: Sky.label.copyWith(fontSize: 11, color: Sky.ink3)),
                  const SizedBox(height: 4),
                  Text(question.isEmpty ? '(no question text)' : question, style: Sky.body),
                ],
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              autofocus: true,
              minLines: 3,
              maxLines: 6,
              maxLength: 600,
              style: Sky.body,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                hintText: 'Your reply — e.g. Do it at sunrise, facing east, for 11 days.',
                filled: true,
                fillColor: Sky.surface,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.all(14),
              ),
            ),
            GoldButton(
              label: alreadyAnswered ? 'Update reply' : 'Send reply',
              onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            ),
          ],
        ),
      ),
    );

    if (text == null || text.isEmpty || !context.mounted) return;
    try {
      await ref
          .read(functionsProvider)
          .httpsCallable('answerRemedyQuestion')
          .call<Map<String, dynamic>>({'remedyId': remedyId, 'answer': text});
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Reply sent to the customer')));
      }
    } on FirebaseFunctionsException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message ?? 'Could not send your reply. Please try again.')),
        );
      }
    }
  }

  String _ago(int ms) {
    final m = (DateTime.now().millisecondsSinceEpoch - ms) ~/ 60000;
    if (m < 1) return 'Just now';
    if (m < 60) return '${m}m ago';
    final h = m ~/ 60;
    if (h < 24) return '${h}h ago';
    return '${h ~/ 24}d ago';
  }
}
