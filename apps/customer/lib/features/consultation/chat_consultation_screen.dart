import 'dart:io';
import 'package:audioplayers/audioplayers.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
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
  const ChatConsultationScreen({super.key, required this.consultationId, required this.astrologer});
  final String consultationId;
  final Astrologer astrologer;

  @override
  ConsumerState<ChatConsultationScreen> createState() => _ChatConsultationScreenState();
}

class _ChatConsultationScreenState extends ConsumerState<ChatConsultationScreen> {
  final _input = TextEditingController();
  final _recorder = AudioRecorder();
  bool _lowBalanceShown = false;
  bool _recording = false;
  DateTime? _recordStart;

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
    _recorder.dispose();
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

  Future<void> _toggleRecord() async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    if (_recording) {
      final path = await _recorder.stop();
      setState(() => _recording = false);
      if (path == null) return;
      final durationMs = _recordStart == null
          ? 0
          : DateTime.now().difference(_recordStart!).inMilliseconds;
      final store = FirebaseStorage.instance
          .ref('voice_notes/$_id/${DateTime.now().millisecondsSinceEpoch}.m4a');
      await store.putFile(File(path), SettableMetadata(contentType: 'audio/mp4'));
      final url = await store.getDownloadURL();
      await _messagesCol.add({
        'senderId': uid,
        'type': 'voice',
        'voice': url,
        'durationMs': durationMs,
        'timestamp': FieldValue.serverTimestamp(),
        'delivered': true,
        'seen': false,
      });
    } else {
      if (!await _recorder.hasPermission()) return;
      final dir = await getTemporaryDirectory();
      final file = '${dir.path}/vn_${DateTime.now().millisecondsSinceEpoch}.m4a';
      await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc), path: file);
      setState(() {
        _recording = true;
        _recordStart = DateTime.now();
      });
    }
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
      success: (c) {
        ref.read(analyticsProvider).logEvent(AnalyticsEvents.consultationCompleted, params: {
          'type': c.type.name,
          'durationSec': c.duration,
        });
        showConsultationEnd(context, ref, consultation: c, astrologer: widget.astrologer);
      },
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
    final peerTyping = ref
            .watch(_peerTypingProvider((id: _id, peerId: widget.astrologer.id)))
            .valueOrNull ??
        false;
    if (messages.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _markSeen(messages));
    }

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
                        if (m['type'] == 'voice') {
                          return _VoiceBubble(
                            url: (m['voice'] ?? '') as String,
                            durationMs: (m['durationMs'] ?? 0) as int,
                            mine: mine,
                          );
                        }
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
                      style: AppTypography.caption.copyWith(fontStyle: FontStyle.italic)),
                ),
              ),
            _Composer(
              controller: _input,
              onSend: _send,
              onAttach: _sendImage,
              onMic: _toggleRecord,
              recording: _recording,
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
                    errorBuilder: (_, __, ___) => const Icon(Icons.broken_image_outlined)),
              ),
            if (text.isNotEmpty)
              Padding(
                padding: EdgeInsets.only(top: hasImage ? 6 : 0, left: hasImage ? 6 : 0, right: hasImage ? 6 : 0),
                child: Text(text,
                    style: AppTypography.body.copyWith(color: mine ? Colors.white : AppColors.textDark)),
              ),
            if (mine)
              Padding(
                padding: const EdgeInsets.only(top: 2, right: 2),
                child: Icon(seen ? Icons.done_all_rounded : Icons.done_rounded,
                    size: 14, color: mine ? Colors.white70 : AppColors.textSecondary),
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
    required this.onMic,
    required this.recording,
    required this.onChanged,
  });
  final TextEditingController controller;
  final VoidCallback onSend;
  final VoidCallback onAttach;
  final VoidCallback onMic;
  final bool recording;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.card,
      padding: EdgeInsets.only(
        left: AppSpacing.sm,
        right: AppSpacing.sm,
        top: AppSpacing.sm,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppSpacing.sm,
      ),
      child: recording
          ? Row(
              children: [
                const SizedBox(width: 8),
                const Icon(Icons.fiber_manual_record, color: AppColors.error, size: 14),
                const SizedBox(width: 8),
                Text('Recording… tap to send', style: AppTypography.body),
                const Spacer(),
                IconButton.filled(
                  style: IconButton.styleFrom(backgroundColor: AppColors.primary),
                  onPressed: onMic,
                  icon: const Icon(Icons.stop_rounded, color: Colors.white),
                ),
              ],
            )
          : Row(
              children: [
                IconButton(
                  onPressed: onAttach,
                  icon: const Icon(Icons.add_photo_alternate_outlined, color: AppColors.primary),
                  tooltip: 'Send image',
                ),
                IconButton(
                  onPressed: onMic,
                  icon: const Icon(Icons.mic_none_rounded, color: AppColors.primary),
                  tooltip: 'Record voice note',
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

/// Inline voice-note player (play/pause + duration) using audioplayers.
class _VoiceBubble extends StatefulWidget {
  const _VoiceBubble({required this.url, required this.durationMs, required this.mine});
  final String url;
  final int durationMs;
  final bool mine;

  @override
  State<_VoiceBubble> createState() => _VoiceBubbleState();
}

class _VoiceBubbleState extends State<_VoiceBubble> {
  final _player = AudioPlayer();
  bool _playing = false;

  @override
  void initState() {
    super.initState();
    _player.onPlayerComplete.listen((_) {
      if (mounted) setState(() => _playing = false);
    });
  }

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  Future<void> _toggle() async {
    if (_playing) {
      await _player.pause();
      setState(() => _playing = false);
    } else {
      await _player.play(UrlSource(widget.url));
      setState(() => _playing = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mine = widget.mine;
    final fg = mine ? Colors.white : AppColors.primary;
    final secs = (widget.durationMs / 1000).round();
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 6),
        decoration: BoxDecoration(
          gradient: mine ? AppColors.primaryGradient : null,
          color: mine ? null : AppColors.card,
          borderRadius: BorderRadius.circular(16),
          boxShadow: mine ? null : AppShadows.soft,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              onPressed: _toggle,
              icon: Icon(_playing ? Icons.pause_circle_filled : Icons.play_circle_fill, color: fg),
            ),
            Icon(Icons.graphic_eq_rounded, color: fg.withValues(alpha: 0.7)),
            const SizedBox(width: 8),
            Text(Money.formatDuration(secs),
                style: AppTypography.caption.copyWith(color: fg)),
            const SizedBox(width: 6),
          ],
        ),
      ),
    );
  }
}
