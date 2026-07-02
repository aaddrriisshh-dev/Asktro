import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import 'consultation_controller.dart';
import 'consultation_header.dart';
import 'consultation_end.dart';

final _messagesProvider =
    StreamProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, id) {
  return ref
      .watch(firestoreProvider)
      .collection('consultations')
      .doc(id)
      .collection('messages')
      .orderBy('timestamp', descending: true)
      .limit(200)
      .snapshots()
      .map((s) => s.docs.map((d) => {'id': d.id, ...d.data()}).toList());
});

class ChatConsultationScreen extends ConsumerStatefulWidget {
  const ChatConsultationScreen({super.key, required this.consultationId, required this.astrologer});
  final String consultationId;
  final Astrologer astrologer;

  @override
  ConsumerState<ChatConsultationScreen> createState() => _ChatConsultationScreenState();
}

class _ChatConsultationScreenState extends ConsumerState<ChatConsultationScreen> {
  final _input = TextEditingController();
  bool _lowBalanceShown = false;

  String get _id => widget.consultationId;

  @override
  void initState() {
    super.initState();
    // Activate the session once the screen is ready (chat connects instantly).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(consultationControllerProvider(_id).notifier).activate();
    });
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    final uid = ref.read(currentUidProvider);
    if (text.isEmpty || uid == null) return;
    _input.clear();
    await ref
        .read(firestoreProvider)
        .collection('consultations')
        .doc(_id)
        .collection('messages')
        .add({
      'senderId': uid,
      'type': 'text',
      'text': text,
      'timestamp': FieldValue.serverTimestamp(),
      'delivered': true,
      'seen': false,
    });
  }

  Future<void> _handleWarn(ConsultationState s) async {
    // Level 1 — polite premium recharge dialog (once).
    if (s.warnLevel == 1 && !_lowBalanceShown) {
      _lowBalanceShown = true;
      final recharge = await showLowBalanceDialog(context, remainingSec: s.displayRemainingSec);
      if (recharge == true && mounted) _goRecharge();
    }
    if (s.warnLevel < 1) _lowBalanceShown = false;

    // Level 3 — paused; block until recharge or end.
    if (s.status == ConsultationStatus.paused && mounted) {
      await _showPaused();
    }
  }

  Future<void> _showPaused() async {
    await showModalBottomSheet<void>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      builder: (_) => Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.pause_circle_filled_rounded, size: 56, color: AppColors.primary),
            const SizedBox(height: AppSpacing.md),
            Text('Consultation Paused', style: AppTypography.subtitle),
            const SizedBox(height: AppSpacing.xs),
            Text('Recharge now to continue exactly where you left off.',
                style: AppTypography.caption, textAlign: TextAlign.center),
            const SizedBox(height: AppSpacing.xl),
            PrimaryButton(
              label: 'Recharge',
              onPressed: () {
                Navigator.pop(context);
                _goRecharge();
              },
            ),
            const SizedBox(height: AppSpacing.sm),
            SecondaryButton(
              label: 'End Consultation',
              onPressed: () {
                Navigator.pop(context);
                _end();
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _goRecharge() async {
    await context.push('/recharge');
    // The recharge function auto-resumes a paused session; also nudge resume.
    if (mounted) await ref.read(consultationControllerProvider(_id).notifier).resume();
  }

  Future<void> _end() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('End consultation?'),
        content: const Text('You will be billed for the time used so far.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          DestructiveButton(label: 'End', onPressed: () => Navigator.pop(context, true)),
        ],
      ),
    );
    if (confirm != true) return;
    final r = await ref.read(consultationControllerProvider(_id).notifier).end();
    if (!mounted) return;
    r.when(
      success: (c) => showConsultationEnd(context, ref, consultation: c, astrologer: widget.astrologer),
      failure: (f) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message))),
    );
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(consultationControllerProvider(_id));
    ref.listen(consultationControllerProvider(_id), (_, next) {
      final s = next.valueOrNull;
      if (s != null) _handleWarn(s);
    });

    final uid = ref.watch(currentUidProvider);
    final messages = ref.watch(_messagesProvider(_id)).valueOrNull ?? const [];

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _end();
      },
      child: Scaffold(
        body: Column(
          children: [
            async.when(
              loading: () => const SizedBox(height: 90),
              error: (_, __) => const SizedBox(height: 90),
              data: (s) => ConsultationHeader(
                astrologerName: widget.astrologer.name,
                photoUrl: widget.astrologer.profilePhoto,
                verified: widget.astrologer.verified,
                remainingSec: s.displayRemainingSec,
                warnLevel: s.warnLevel,
                onRecharge: _goRecharge,
              ),
            ),
            Expanded(
              child: messages.isEmpty
                  ? const EmptyState(
                      icon: Icons.waving_hand_rounded,
                      title: 'Say hello 👋',
                      message: 'Share your birth details to begin your consultation.',
                    )
                  : ListView.builder(
                      reverse: true,
                      padding: const EdgeInsets.all(AppSpacing.lg),
                      itemCount: messages.length,
                      itemBuilder: (_, i) {
                        final m = messages[i];
                        final mine = m['senderId'] == uid;
                        return _Bubble(text: (m['text'] ?? '') as String, mine: mine, seen: m['seen'] == true);
                      },
                    ),
            ),
            _Composer(controller: _input, onSend: _send),
          ],
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.text, required this.mine, required this.seen});
  final String text;
  final bool mine;
  final bool seen;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
        decoration: BoxDecoration(
          gradient: mine ? AppColors.primaryGradient : null,
          color: mine ? null : AppColors.card,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(mine ? 16 : 4),
            bottomRight: Radius.circular(mine ? 4 : 16),
          ),
          boxShadow: mine ? null : AppShadows.soft,
        ),
        child: Text(text,
            style: AppTypography.body.copyWith(color: mine ? Colors.white : AppColors.textDark)),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({required this.controller, required this.onSend});
  final TextEditingController controller;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.card,
      padding: EdgeInsets.only(
        left: AppSpacing.lg,
        right: AppSpacing.sm,
        top: AppSpacing.sm,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppSpacing.sm,
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              minLines: 1,
              maxLines: 4,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(hintText: 'Type a message...', filled: false, border: InputBorder.none),
            ),
          ),
          IconButton.filled(
            style: IconButton.styleFrom(backgroundColor: AppColors.primary),
            onPressed: onSend,
            icon: const Icon(Icons.send_rounded, color: Colors.white),
          ),
        ],
      ),
    );
  }
}
