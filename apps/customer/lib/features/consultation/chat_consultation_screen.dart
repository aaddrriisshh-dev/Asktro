import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../app/celestial_background.dart';
import '../../data/messaging_service.dart';
import 'consultation_controller.dart';
import 'consultation_header.dart';
import 'consultation_end.dart';

/// Whether the astrologer is currently typing (their typing doc exists & fresh).
final _peerTypingProvider = StreamProvider.autoDispose.family<bool, ({String id, String peerId})>((ref, arg) {
  return ref
      .watch(firestoreProvider)
      .collection('consultations')
      .doc(arg.id)
      .collection('typing')
      .doc(arg.peerId)
      .snapshots()
      .map((d) {
    if (!d.exists) return false;
    final ts = d.data()?['at'];
    if (ts is Timestamp) {
      return DateTime.now().difference(ts.toDate()).inSeconds < 6;
    }
    return d.data()?['typing'] == true;
  });
});

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
  const ChatConsultationScreen({
    super.key,
    required this.consultationId,
    required this.astrologer,
    this.readOnly = false,
  });
  final String consultationId;
  final Astrologer astrologer;

  /// Opened from history for a finished consultation: show the transcript only
  /// (no activation, no billing, no composer).
  final bool readOnly;

  @override
  ConsumerState<ChatConsultationScreen> createState() => _ChatConsultationScreenState();
}

class _ChatConsultationScreenState extends ConsumerState<ChatConsultationScreen> {
  final _input = TextEditingController();
  bool _lowBalanceShown = false;
  bool _graceShown = false;

  String get _id => widget.consultationId;

  @override
  void initState() {
    super.initState();
    if (widget.readOnly) return; // history view — never (re)activate/bill.
    // AI personas have no human to accept, so the customer activates instantly.
    // For a HUMAN astrologer we must NOT auto-activate: the session has to stay
    // `waiting` so it appears in the astrologer's request queue and THEY accept
    // it (activating here would flip it to `active` and steal it from them).
    if (!widget.astrologer.isAI) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(consultationControllerProvider(_id).notifier).activate();
    });
  }

  // Read-only transcript for a finished consultation (opened from history).
  Widget _readOnlyView() {
    final uid = ref.watch(currentUidProvider);
    final messages = ref.watch(_messagesProvider(_id)).valueOrNull ?? const [];
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.card,
        foregroundColor: AppColors.textDark,
        titleSpacing: 0,
        title: Row(
          children: [
            AppAvatar(name: widget.astrologer.name, photoUrl: widget.astrologer.profilePhoto, size: 32),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(widget.astrologer.name,
                  style: AppTypography.body.copyWith(fontWeight: FontWeight.w700),
                  overflow: TextOverflow.ellipsis,),
            ),
          ],
        ),
      ),
      body: DotGridBackground(
        child: messages.isEmpty
            ? const EmptyState(
                icon: Icons.history_rounded,
                title: 'No messages',
                message: 'This consultation has no saved messages.',
              )
            : ListView.builder(
                reverse: true,
                // Bottom-safe so the newest bubble clears the phone's gesture bar
                // instead of sliding under it.
                padding: EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg,
                    AppSpacing.lg + MediaQuery.of(context).padding.bottom),
                itemCount: messages.length,
                itemBuilder: (_, i) {
                  final m = messages[i];
                  return _Bubble(
                    text: (m['text'] ?? '') as String,
                    imageUrl: m['image'] as String?,
                    mine: m['senderId'] == uid,
                    seen: m['seen'] == true,
                  );
                },
              ),
      ),
    );
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  CollectionReference<Map<String, dynamic>> get _messagesCol => ref
      .read(firestoreProvider)
      .collection('consultations')
      .doc(_id)
      .collection('messages');

  Future<void> _send() async {
    final text = _input.text.trim();
    final uid = ref.read(currentUidProvider);
    if (text.isEmpty || uid == null) return;
    _input.clear();
    _setTyping(false);
    await _messagesCol.add({
      'senderId': uid,
      'type': 'text',
      'text': text,
      'timestamp': FieldValue.serverTimestamp(),
      'delivered': true,
      'seen': false,
    });
  }

  Future<void> _sendImage() async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 70);
    if (picked == null) return;
    final data = await picked.readAsBytes();
    final refStore = FirebaseStorage.instance
        .ref('chat_images/$_id/${DateTime.now().millisecondsSinceEpoch}.jpg');
    await refStore.putData(data, SettableMetadata(contentType: 'image/jpeg'));
    final url = await refStore.getDownloadURL();
    await _messagesCol.add({
      'senderId': uid,
      'type': 'image',
      'image': url,
      'timestamp': FieldValue.serverTimestamp(),
      'delivered': true,
      'seen': false,
    });
  }

  DateTime _lastTypingWrite = DateTime.fromMillisecondsSinceEpoch(0);
  void _setTyping(bool typing) {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    // Throttle writes to at most one per ~3s while typing.
    final now = DateTime.now();
    if (typing && now.difference(_lastTypingWrite).inSeconds < 3) return;
    _lastTypingWrite = now;
    ref
        .read(firestoreProvider)
        .collection('consultations')
        .doc(_id)
        .collection('typing')
        .doc(uid)
        .set({'typing': typing, 'at': FieldValue.serverTimestamp()});
  }

  /// Mark the astrologer's delivered-but-unseen messages as seen.
  void _markSeen(List<Map<String, dynamic>> messages) {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    for (final m in messages) {
      if (m['senderId'] != uid && m['seen'] != true) {
        _messagesCol.doc(m['id'] as String).update({'seen': true});
      }
    }
  }

  Future<void> _handleWarn(ConsultationState s) async {
    // Grace minute — a one-time gift when the balance ran out. Celebrate it and
    // suppress the low-balance nudge for this cycle so they don't stack.
    if (s.consultation.graceGranted && !_graceShown) {
      _graceShown = true;
      _lowBalanceShown = true;
      if (mounted) await showGraceBonusDialog(context, minutes: 1);
      return;
    }

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
                style: AppTypography.caption, textAlign: TextAlign.center,),
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
      success: (c) {
        ref.read(analyticsProvider).logEvent(AnalyticsEvents.consultationCompleted, params: {
          'type': c.type.name,
          'durationSec': c.duration,
        },);
        showConsultationEnd(context, ref, consultation: c, astrologer: widget.astrologer);
      },
      failure: (f) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message))),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.readOnly) return _readOnlyView();
    final async = ref.watch(consultationControllerProvider(_id));
    ref.listen(consultationControllerProvider(_id), (_, next) {
      final s = next.valueOrNull;
      if (s != null) _handleWarn(s);
    });

    final uid = ref.watch(currentUidProvider);
    final messages = ref.watch(_messagesProvider(_id)).valueOrNull ?? const [];
    final peerTyping = ref
            .watch(_peerTypingProvider((id: _id, peerId: widget.astrologer.id)))
            .valueOrNull ??
        false;
    if (messages.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _markSeen(messages));
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      // Back just leaves the chat; the session keeps running and is resumable
      // from the Consultations tab. Ending is an explicit choice (the End button).
      body: DotGridBackground(
        child: Column(
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
                onBack: () => Navigator.of(context).maybePop(),
                onEnd: _end,
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
                        return _Bubble(
                          text: (m['text'] ?? '') as String,
                          imageUrl: m['image'] as String?,
                          mine: mine,
                          seen: m['seen'] == true,
                        );
                      },
                    ),
            ),
            if (peerTyping)
              Padding(
                padding: const EdgeInsets.only(left: AppSpacing.xl, bottom: AppSpacing.xs),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text('${widget.astrologer.name} is typing…',
                      style: AppTypography.caption.copyWith(fontStyle: FontStyle.italic),),
                ),
              ),
            _Composer(
              controller: _input,
              onSend: _send,
              onAttach: _sendImage,
              onChanged: (v) => _setTyping(v.trim().isNotEmpty),
            ),
          ],
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.text, required this.mine, required this.seen, this.imageUrl});
  final String text;
  final String? imageUrl;
  final bool mine;
  final bool seen;

  @override
  Widget build(BuildContext context) {
    final hasImage = imageUrl != null && imageUrl!.isNotEmpty;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: hasImage
            ? const EdgeInsets.all(4)
            : const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
        decoration: BoxDecoration(
          gradient: mine && !hasImage ? AppColors.primaryGradient : null,
          color: mine
              ? (hasImage ? AppColors.primary : null)
              : AppColors.card,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(mine ? 16 : 4),
            bottomRight: Radius.circular(mine ? 4 : 16),
          ),
          boxShadow: mine ? null : AppShadows.soft,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (hasImage)
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.network(imageUrl!, fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const Icon(Icons.broken_image_outlined),),
              ),
            if (text.isNotEmpty)
              Padding(
                padding: EdgeInsets.only(top: hasImage ? 6 : 0, left: hasImage ? 6 : 0, right: hasImage ? 6 : 0),
                child: Text(text,
                    style: AppTypography.body.copyWith(
                        color: mine ? Colors.white : AppColors.textDark, fontSize: 14.5, height: 1.3),),
              ),
            if (mine)
              Padding(
                padding: const EdgeInsets.only(top: 2, right: 2),
                child: Icon(seen ? Icons.done_all_rounded : Icons.done_rounded,
                    size: 14, color: mine ? Colors.white70 : AppColors.textSecondary,),
              ),
          ],
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.onSend,
    required this.onAttach,
    required this.onChanged,
  });
  final TextEditingController controller;
  final VoidCallback onSend;
  final VoidCallback onAttach;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.card,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      // Scaffold.resizeToAvoidBottomInset lifts this above the keyboard; the
      // extra padding.bottom keeps it clear of the phone's gesture/nav bar so it
      // never hides under the viewport.
      padding: EdgeInsets.only(
        left: AppSpacing.sm,
        right: AppSpacing.sm,
        top: AppSpacing.sm,
        bottom: AppSpacing.sm + MediaQuery.of(context).padding.bottom,
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: onAttach,
            icon: const Icon(Icons.add_photo_alternate_outlined, color: AppColors.primary),
            tooltip: 'Send image',
          ),
          Expanded(
            child: TextField(
              controller: controller,
              minLines: 1,
              maxLines: 4,
              textCapitalization: TextCapitalization.sentences,
              onChanged: onChanged,
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
