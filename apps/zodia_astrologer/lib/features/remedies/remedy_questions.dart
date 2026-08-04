import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../ui/celestial.dart';
import '../../ui/customer_details_card.dart';

/// Pending remedy follow-ups for the signed-in astrologer — questions a customer
/// asked about a remedy that haven't been answered yet. `answered == false` only
/// exists on remedies that carry a question, so it precisely selects the inbox.
/// Requires the composite index (astrologerId, answered, questionAt) in
/// firestore.indexes.json.
final pendingRemedyQuestionsProvider =
    StreamProvider.autoDispose<List<Map<String, dynamic>>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref
      .watch(firestoreProvider)
      .collection('remedies')
      .where('astrologerId', isEqualTo: uid)
      .where('answered', isEqualTo: false)
      .orderBy('questionAt', descending: true)
      .limit(100)
      .snapshots()
      .map((s) => s.docs.map((d) => {'id': d.id, ...d.data()}).toList());
});

/// Live view of a single remedy, so the answer screen reflects a reply instantly.
final _remedyProvider =
    StreamProvider.autoDispose.family<Map<String, dynamic>, String>((ref, id) {
  return ref.watch(firestoreProvider).collection('remedies').doc(id).snapshots().map(
        (d) => {'id': d.id, ...?d.data()},
      );
});

/// Read-only transcript of a past consultation, oldest-first for reading.
final _transcriptProvider =
    StreamProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, id) {
  return ref
      .watch(firestoreProvider)
      .collection('consultations')
      .doc(id)
      .collection('messages')
      .orderBy('timestamp', descending: false)
      .limit(300)
      .snapshots()
      .map((s) => s.docs.map((d) => d.data()).toList());
});

/// Opens the rich answer screen for a remedy question.
void openRemedyAnswer(BuildContext context, String remedyId) {
  Navigator.of(context).push(
    MaterialPageRoute<void>(builder: (_) => RemedyAnswerScreen(remedyId: remedyId)),
  );
}

// ============================ INBOX LIST ============================

/// The astrologer's "Remedy questions" inbox — pending follow-ups, each with the
/// customer's name so it's instantly clear who is asking about what.
class RemedyQuestionsScreen extends ConsumerWidget {
  const RemedyQuestionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(pendingRemedyQuestionsProvider);
    final topPad = MediaQuery.of(context).padding.top;

    // Prefer any data we already have — a transient error (e.g. while the
    // composite index finishes building) should never wipe a good list.
    final list = async.valueOrNull;
    if (list == null) {
      return SkyScaffold(
        child: async.isLoading
            ? const Center(child: CircularProgressIndicator(color: Sky.purple))
            : const Center(child: ErrorStateView()),
      );
    }

    return SkyScaffold(
      child: Builder(
        builder: (context) => ListView(
          padding: EdgeInsets.fromLTRB(16, topPad + 14, 16, 30),
          children: [
            Row(
              children: [
                GestureDetector(
                  onTap: () => Navigator.of(context).maybePop(),
                  behavior: HitTestBehavior.opaque,
                  child: const Icon(Icons.arrow_back_rounded, color: Sky.ink),
                ),
                const SizedBox(width: 10),
                Text('Remedy questions', style: Sky.h1),
              ],
            ),
            const SizedBox(height: 6),
            Text('Customers asking about a remedy you suggested.',
                style: Sky.label.copyWith(fontSize: 12.5),),
            const SizedBox(height: 16),
            if (list.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 70),
                child: Column(
                  children: [
                    const Icon(Icons.mark_chat_read_rounded, size: 46, color: Sky.ink3),
                    const SizedBox(height: 12),
                    Text('All caught up', style: Sky.h2.copyWith(fontSize: 15)),
                    const SizedBox(height: 4),
                    Text('No pending remedy questions right now.',
                        style: Sky.label.copyWith(fontSize: 12.5), textAlign: TextAlign.center,),
                  ],
                ),
              )
            else
              for (final r in list)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _QuestionRow(data: r),
                ),
          ],
        ),
      ),
    );
  }
}

class _QuestionRow extends ConsumerWidget {
  const _QuestionRow({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final customerId = (data['customerId'] ?? '') as String;
    final cust = ref.watch(customerProvider(customerId)).valueOrNull;
    final name = cust?.name ?? (data['customerName'] as String?) ?? 'Customer';
    final title = (data['title'] ?? 'Remedy') as String;
    final question = (data['question'] ?? '') as String;
    final ts = data['questionAt'];
    final ms = ts is Timestamp ? ts.millisecondsSinceEpoch : null;

    return SkyCard(
      onTap: () => openRemedyAnswer(context, data['id'] as String),
      padding: const EdgeInsets.all(13),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppAvatar(name: name, photoUrl: cust?.profilePhoto, size: 44),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(name,
                          style: Sky.h2.copyWith(fontSize: 14.5),
                          maxLines: 1, overflow: TextOverflow.ellipsis,),
                    ),
                    if (ms != null)
                      Text(_ago(ms), style: Sky.label.copyWith(fontSize: 10.5, color: Sky.ink3)),
                  ],
                ),
                const SizedBox(height: 2),
                Text('On “$title”',
                    style: Sky.label.copyWith(fontSize: 11.5, color: Sky.gold, fontWeight: FontWeight.w700),
                    maxLines: 1, overflow: TextOverflow.ellipsis,),
                const SizedBox(height: 5),
                Text(question,
                    style: Sky.body.copyWith(fontSize: 13, height: 1.3),
                    maxLines: 2, overflow: TextOverflow.ellipsis,),
              ],
            ),
          ),
          const SizedBox(width: 6),
          const Icon(Icons.chevron_right_rounded, color: Sky.ink3),
        ],
      ),
    );
  }
}

// ============================ ANSWER SCREEN ============================

/// A context-rich screen to answer one remedy question: the customer's kundli
/// snapshot (so the astrologer recalls the case), the exact remedy they
/// suggested, the question, a one-tap link to the original conversation, and the
/// reply box. Sends via the `answerRemedyQuestion` callable.
class RemedyAnswerScreen extends ConsumerStatefulWidget {
  const RemedyAnswerScreen({required this.remedyId, super.key});
  final String remedyId;

  @override
  ConsumerState<RemedyAnswerScreen> createState() => _RemedyAnswerScreenState();
}

class _RemedyAnswerScreenState extends ConsumerState<RemedyAnswerScreen> {
  final _ctrl = TextEditingController();
  bool _sending = false;
  bool _prefilled = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _ctrl.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await ref
          .read(functionsProvider)
          .httpsCallable('answerRemedyQuestion')
          .call<Map<String, dynamic>>({'remedyId': widget.remedyId, 'answer': text});
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Reply sent to the customer')));
        Navigator.of(context).maybePop();
      }
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message ?? 'Could not send your reply. Please try again.')),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final remedy = ref.watch(_remedyProvider(widget.remedyId)).valueOrNull ?? const {};
    final customerId = (remedy['customerId'] ?? '') as String;
    final cust = ref.watch(customerProvider(customerId)).valueOrNull;

    final title = (remedy['title'] ?? 'Remedy') as String;
    final note = (remedy['note'] ?? '') as String;
    final question = (remedy['question'] ?? '') as String;
    final answer = (remedy['answer'] ?? '') as String;
    final answered = remedy['answered'] == true && answer.isNotEmpty;
    final consultationId = remedy['consultationId'] as String?;
    final selfId = ref.watch(currentUidProvider);

    // Pre-fill the box with any existing answer so the astrologer can amend it.
    if (answered && !_prefilled && _ctrl.text.isEmpty) {
      _ctrl.text = answer;
      _prefilled = true;
    }

    return Scaffold(
      backgroundColor: Sky.bg,
      appBar: AppBar(
        backgroundColor: Sky.bg,
        surfaceTintColor: Sky.bg,
        foregroundColor: Sky.ink,
        elevation: 0,
        title: Text('Remedy question', style: Sky.h2),
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(16, 8, 16, 28 + MediaQuery.of(context).padding.bottom),
        children: [
          // Who — the kundli snapshot jogs the astrologer's memory of the case.
          CustomerDetailsCard(profile: cust),
          const SizedBox(height: 16),

          // What they prescribed.
          Text('YOU SUGGESTED', style: Sky.label.copyWith(fontSize: 10.5, letterSpacing: 1, color: Sky.gold, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(15),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFFFFDF3), Color(0xFFFFD98A)],
              ),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Sky.gold.withValues(alpha: 0.45)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.self_improvement_rounded, size: 16, color: Sky.purpleDeep),
                    const SizedBox(width: 7),
                    Expanded(child: Text(title, style: Sky.h2.copyWith(fontSize: 15, color: Sky.purpleDeep))),
                  ],
                ),
                if (note.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(note, style: Sky.body.copyWith(height: 1.45, color: Sky.ink)),
                ],
              ],
            ),
          ),

          if (consultationId != null && consultationId.isNotEmpty) ...[
            const SizedBox(height: 10),
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                builder: (_) => RemedyConversationScreen(consultationId: consultationId, selfId: selfId ?? ''),
              ),),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.forum_rounded, size: 15, color: Sky.purple),
                  const SizedBox(width: 6),
                  Text('View the original conversation',
                      style: Sky.label.copyWith(color: Sky.purple, fontWeight: FontWeight.w700, fontSize: 12.5),),
                ],
              ),
            ),
          ],

          const SizedBox(height: 18),

          // The question.
          Text('THEY ASKED', style: Sky.label.copyWith(fontSize: 10.5, letterSpacing: 1, color: Sky.purple, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Sky.purple.withValues(alpha: 0.07),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Sky.purple.withValues(alpha: 0.18)),
            ),
            child: Text(question.isEmpty ? '(no question text)' : question,
                style: Sky.body.copyWith(height: 1.4),),
          ),

          const SizedBox(height: 18),

          // The reply.
          Text(answered ? 'YOUR REPLY (tap to amend)' : 'YOUR REPLY',
              style: Sky.label.copyWith(fontSize: 10.5, letterSpacing: 1, color: Sky.ink2, fontWeight: FontWeight.w800),),
          const SizedBox(height: 8),
          TextField(
            controller: _ctrl,
            minLines: 3,
            maxLines: 7,
            maxLength: 600,
            style: Sky.body,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              hintText: 'e.g. Do it at sunrise, facing east, for 11 days.',
              filled: true,
              fillColor: Sky.card,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Sky.line)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Sky.line)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Sky.purple)),
              contentPadding: const EdgeInsets.all(14),
            ),
          ),
          const SizedBox(height: 6),
          GoldButton(
            label: answered ? 'Update reply' : 'Send reply',
            loading: _sending,
            onPressed: _send,
          ),
        ],
      ),
    );
  }
}

// ============================ READ-ONLY TRANSCRIPT ============================

/// A read-only view of the original consultation, so the astrologer can revisit
/// the full backstory before replying. No composing — purely for recall.
class RemedyConversationScreen extends ConsumerWidget {
  const RemedyConversationScreen({required this.consultationId, required this.selfId, super.key});
  final String consultationId;
  final String selfId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_transcriptProvider(consultationId));
    return Scaffold(
      backgroundColor: Sky.bg,
      appBar: AppBar(
        backgroundColor: Sky.bg,
        surfaceTintColor: Sky.bg,
        foregroundColor: Sky.ink,
        elevation: 0,
        title: Text('Original conversation', style: Sky.h2),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Sky.purple)),
        error: (_, __) => const Center(child: ErrorStateView()),
        data: (msgs) {
          if (msgs.isEmpty) {
            return Center(
              child: Text('No messages in this conversation.',
                  style: Sky.label.copyWith(fontSize: 12.5),),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 24),
            itemCount: msgs.length,
            itemBuilder: (_, i) {
              final m = msgs[i];
              final mine = m['senderId'] == selfId;
              final text = (m['text'] ?? m['note'] ?? '') as String;
              if (text.isEmpty) return const SizedBox.shrink();
              return Align(
                alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  margin: const EdgeInsets.symmetric(vertical: 4),
                  padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
                  constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.76),
                  decoration: BoxDecoration(
                    color: mine ? Sky.purple : Sky.card,
                    borderRadius: BorderRadius.circular(14),
                    border: mine ? null : Border.all(color: Sky.line),
                  ),
                  child: Text(text,
                      style: Sky.body.copyWith(color: mine ? Colors.white : Sky.ink, height: 1.35),),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

String _ago(int ms) {
  final m = (DateTime.now().millisecondsSinceEpoch - ms) ~/ 60000;
  if (m < 1) return 'Just now';
  if (m < 60) return '${m}m';
  final h = m ~/ 60;
  if (h < 24) return '${h}h';
  return '${h ~/ 24}d';
}
