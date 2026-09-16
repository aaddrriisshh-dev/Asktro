import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';

/// Help & Support: raise a ticket (stored in supportTickets) + quick FAQ.
class SupportScreen extends ConsumerStatefulWidget {
  const SupportScreen({super.key});

  @override
  ConsumerState<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends ConsumerState<SupportScreen> {
  final _subject = TextEditingController();
  final _body = TextEditingController();
  bool _submitting = false;

  Future<void> _submit() async {
    final uid = ref.read(currentUidProvider);
    if (uid == null || _subject.text.trim().isEmpty || _body.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please fill in both fields.')));
      return;
    }
    setState(() => _submitting = true);
    await ref.read(firestoreProvider).collection('supportTickets').add({
      'customerId': uid,
      'subject': _subject.text.trim(),
      'body': _body.text.trim(),
      'priority': 'normal',
      'status': 'open',
      'createdAt': FieldValue.serverTimestamp(),
    });
    if (!mounted) return;
    _subject.clear();
    _body.clear();
    setState(() => _submitting = false);
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Ticket raised. Our team will get back to you.')));
  }

  @override
  void dispose() {
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Help & Support')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg,
            AppSpacing.lg + MediaQuery.of(context).padding.bottom,),
        children: [
          Text('Raise a ticket', style: AppTypography.subtitle),
          const SizedBox(height: AppSpacing.md),
          TextField(controller: _subject, decoration: const InputDecoration(hintText: 'Subject')),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _body,
            minLines: 4,
            maxLines: 8,
            decoration: const InputDecoration(hintText: 'Describe your issue'),
          ),
          const SizedBox(height: AppSpacing.lg),
          PrimaryButton(label: 'Submit ticket', loading: _submitting, onPressed: _submitting ? null : _submit),
          const SizedBox(height: AppSpacing.xxl),
          const _MyTickets(),
          Text('Frequently asked', style: AppTypography.subtitle),
          const SizedBox(height: AppSpacing.md),
          ..._faqs.map((f) => _FaqTile(q: f.$1, a: f.$2)),
        ],
      ),
    );
  }
}

/// The customer's own tickets, newest first, each with a copyable ticket number
/// (assigned server-side moments after submission) and current status.
class _MyTickets extends ConsumerWidget {
  const _MyTickets();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uid = ref.watch(currentUidProvider);
    if (uid == null) return const SizedBox.shrink();
    final stream = ref
        .read(firestoreProvider)
        .collection('supportTickets')
        .where('customerId', isEqualTo: uid)
        .snapshots();

    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: stream,
      builder: (context, snap) {
        final docs = snap.data?.docs ?? const [];
        if (docs.isEmpty) return const SizedBox.shrink();
        // Sort client-side so we don't need a composite index.
        final sorted = [...docs]..sort((a, b) {
            final ta = (a.data()['createdAt'] as Timestamp?)?.millisecondsSinceEpoch ?? 0;
            final tb = (b.data()['createdAt'] as Timestamp?)?.millisecondsSinceEpoch ?? 0;
            return tb.compareTo(ta);
          });
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Your tickets', style: AppTypography.subtitle),
            const SizedBox(height: AppSpacing.md),
            ...sorted.map((d) => _TicketTile(key: ValueKey(d.id), id: d.id, data: d.data())),
            const SizedBox(height: AppSpacing.xxl),
          ],
        );
      },
    );
  }
}

class _TicketTile extends ConsumerStatefulWidget {
  const _TicketTile({super.key, required this.id, required this.data});
  final String id;
  final Map<String, dynamic> data;

  @override
  ConsumerState<_TicketTile> createState() => _TicketTileState();
}

class _TicketTileState extends ConsumerState<_TicketTile> {
  final _reply = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _reply.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await ref.read(functionsProvider).httpsCallable('customerReplySupportTicket').call<Map<String, dynamic>>({
        'ticketId': widget.id,
        'text': text,
      });
      _reply.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Reply sent.')));
      }
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message ?? 'Could not send reply.')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not send reply.')));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = widget.data;
    final ticketNo = data['ticketNo'] as String?;
    final subject = (data['subject'] as String?) ?? 'Support request';
    final status = (data['status'] as String?) ?? 'open';
    final closed = status == 'closed';
    // The customer app writes the first message to `body`; support replies land in
    // the `thread` array (by:'admin'/'customer'). Show the whole conversation so a
    // reply from support is actually readable in the app.
    final message = (data['body'] ?? data['message'] ?? '') as String;
    final thread = (data['thread'] as List?) ?? const [];
    final replies = thread.whereType<Map>().toList();
    final hasReplies = replies.isNotEmpty;

    Widget msgLine(String from, String text, {bool fromSupport = false}) => Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                from,
                style: AppTypography.caption.copyWith(
                  fontWeight: FontWeight.w700,
                  color: fromSupport ? AppColors.primary : AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 2),
              Text(text.isEmpty ? '—' : text, style: AppTypography.caption),
            ],
          ),
        );

    final header = Row(
      children: [
        Expanded(
          child: Text(
            ticketNo ?? 'Assigning number…',
            style: AppTypography.body.copyWith(
              fontWeight: FontWeight.w700,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ),
        if (ticketNo != null)
          IconButton(
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.copy_rounded, size: 18),
            tooltip: 'Copy ticket number',
            onPressed: () {
              Clipboard.setData(ClipboardData(text: ticketNo));
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Copied $ticketNo')),
              );
            },
          ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: (closed ? Colors.green : AppColors.primary).withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            closed ? 'Closed' : 'Open',
            style: AppTypography.caption.copyWith(
              color: closed ? Colors.green.shade700 : AppColors.primary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: AppCard(
        child: Theme(
          data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
          child: ExpansionTile(
            tilePadding: EdgeInsets.zero,
            childrenPadding: const EdgeInsets.only(top: AppSpacing.sm),
            title: header,
            subtitle: Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Row(
                children: [
                  Expanded(child: Text(subject, style: AppTypography.caption)),
                  if (hasReplies)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        '${replies.length} repl${replies.length == 1 ? 'y' : 'ies'}',
                        style: AppTypography.caption.copyWith(
                          color: AppColors.primary, fontWeight: FontWeight.w700, fontSize: 10.5,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            children: [
              const Divider(height: 1),
              const SizedBox(height: AppSpacing.sm),
              msgLine('You', message),
              ...replies.map((m) {
                final by = (m['by'] as String?) ?? 'admin';
                final fromSupport = by != 'customer';
                return msgLine(
                  fromSupport ? 'Support' : 'You',
                  (m['text'] as String?) ?? '',
                  fromSupport: fromSupport,
                );
              }),
              if (!hasReplies)
                Padding(
                  padding: const EdgeInsets.only(top: 2, bottom: AppSpacing.sm),
                  child: Text(
                    "Our team will reply here. You'll get a notification.",
                    style: AppTypography.caption.copyWith(color: AppColors.textSecondary, fontStyle: FontStyle.italic),
                  ),
                ),
              // Reply box — a reply reopens the ticket if it was closed, and
              // notifies the support team (portal alert).
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xs),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _reply,
                        minLines: 1,
                        maxLines: 4,
                        textInputAction: TextInputAction.newline,
                        decoration: InputDecoration(
                          isDense: true,
                          hintText: closed ? 'Reply to reopen this ticket…' : 'Reply to support…',
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    _sending
                        ? const Padding(
                            padding: EdgeInsets.all(8),
                            child: SizedBox(
                              width: 18, height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
                            ),
                          )
                        : IconButton(
                            icon: const Icon(Icons.send_rounded, color: AppColors.primary),
                            tooltip: 'Send reply',
                            onPressed: _send,
                          ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

const _faqs = [
  ('How is a consultation charged?', "Chatting with our new astrologers is free and unlimited. A consultation with a verified astrologer is billed per minute at their own rate (shown on their profile), calculated per second, from your wallet."),
  ('What happens if my balance runs out?', 'The consultation pauses. Recharge to resume exactly where you left off — your chat history is preserved.'),
  ('How do refunds work?', 'If a consultation ends due to an astrologer or network issue, unused balance is handled per our refund policy.'),
  ('How do I delete my account?', 'Profile → Delete account. This permanently erases your profile, chats and personal data after any active consultation ends. Anonymised payment records are retained as required by law.'),
];

class _FaqTile extends StatelessWidget {
  const _FaqTile({required this.q, required this.a});
  final String q;
  final String a;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: AppCard(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.xs),
        child: Theme(
          data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
          child: ExpansionTile(
            tilePadding: EdgeInsets.zero,
            title: Text(q, style: AppTypography.body.copyWith(fontWeight: FontWeight.w600)),
            children: [
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(a, style: AppTypography.caption),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
