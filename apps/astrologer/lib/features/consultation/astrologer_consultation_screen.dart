import 'dart:async';
import 'package:agora_rtc_engine/agora_rtc_engine.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';

/// The astrologer's live consultation screen. Handles accepting a waiting
/// request (activates the server session), then conducts the chat or call. The
/// astrologer never sees the customer's wallet — only session state and their
/// own session earnings. Billing is driven by the backend; this screen sends
/// the heartbeat while active.
class AstrologerConsultationScreen extends ConsumerStatefulWidget {
  const AstrologerConsultationScreen({super.key, required this.consultationId, required this.self});
  final String consultationId;
  final Astrologer self;

  @override
  ConsumerState<AstrologerConsultationScreen> createState() => _State();
}

class _State extends ConsumerState<AstrologerConsultationScreen> {
  final _input = TextEditingController();
  Timer? _heartbeat;
  RtcEngine? _engine;
  int? _remoteUid;
  String? _channel;
  bool _accepting = false;

  String get _id => widget.consultationId;

  @override
  void dispose() {
    _heartbeat?.cancel();
    _input.dispose();
    _engine?.leaveChannel();
    _engine?.release();
    super.dispose();
  }

  void _ensureHeartbeat(ConsultationStatus status) {
    if (status == ConsultationStatus.active) {
      _heartbeat ??= Timer.periodic(const Duration(seconds: 10),
          (_) => ref.read(consultationServiceProvider).tick(_id));
    } else {
      _heartbeat?.cancel();
      _heartbeat = null;
    }
  }

  Future<void> _accept(Consultation c) async {
    setState(() => _accepting = true);
    final r = await ref.read(consultationServiceProvider).accept(_id);
    if (!mounted) return;
    setState(() => _accepting = false);
    r.when(
      success: (_) {
        if (c.type != ConsultationType.chat) _joinCall(c);
      },
      failure: (f) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message))),
    );
  }

  Future<void> _decline() async {
    await ref.read(consultationServiceProvider).decline(_id);
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _end() async {
    await ref.read(consultationServiceProvider).end(_id);
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _joinCall(Consultation c) async {
    await (c.type == ConsultationType.video
        ? [Permission.microphone, Permission.camera]
        : [Permission.microphone])
        .request();
    final creds = (await ref.read(_tokenProvider(_id).future));
    if (creds == null) return;
    final engine = createAgoraRtcEngine();
    await engine.initialize(RtcEngineContext(appId: creds.appId));
    _engine = engine;
    _channel = creds.channel;
    engine.registerEventHandler(RtcEngineEventHandler(
      onUserJoined: (_, uid, __) => setState(() => _remoteUid = uid),
      onUserOffline: (_, uid, __) => setState(() => _remoteUid = null),
    ));
    if (c.type == ConsultationType.video) {
      await engine.enableVideo();
      await engine.startPreview();
    } else {
      await engine.enableAudio();
    }
    await engine.joinChannel(
      token: creds.token,
      channelId: creds.channel,
      uid: creds.uid,
      options: ChannelMediaOptions(
        channelProfile: ChannelProfileType.channelProfileCommunication,
        clientRoleType: ClientRoleType.clientRoleBroadcaster,
        publishCameraTrack: c.type == ConsultationType.video,
        publishMicrophoneTrack: true,
      ),
    );
  }

  Future<void> _send(Consultation c) async {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    _input.clear();
    await ref.read(firestoreProvider).collection('consultations').doc(_id).collection('messages').add({
      'senderId': widget.self.id,
      'type': 'text',
      'text': text,
      'timestamp': FieldValue.serverTimestamp(),
      'delivered': true,
      'seen': false,
    });
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_sessionProvider(_id));
    return async.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator(color: AppColors.primary))),
      error: (_, __) => const Scaffold(body: ErrorStateView()),
      data: (c) {
        _ensureHeartbeat(c.status);
        if (c.status == ConsultationStatus.waiting) return _waitingView(c);
        if (c.status.isTerminal) {
          return _summaryView(c);
        }
        return c.type == ConsultationType.chat ? _chatView(c) : _callView(c);
      },
    );
  }

  Widget _waitingView(Consultation c) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.notifications_active_rounded, size: 64, color: AppColors.primary),
              const SizedBox(height: AppSpacing.lg),
              Text('New ${c.type.name} consultation', style: AppTypography.title),
              const SizedBox(height: AppSpacing.xs),
              Text('₹9/min', style: AppTypography.caption),
              const SizedBox(height: AppSpacing.xxl),
              PrimaryButton(label: 'Accept', loading: _accepting, onPressed: _accepting ? null : () => _accept(c)),
              const SizedBox(height: AppSpacing.sm),
              SecondaryButton(label: 'Decline', onPressed: _decline),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header(Consultation c, {Color? color}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      decoration: BoxDecoration(color: color ?? AppColors.card, boxShadow: AppShadows.soft),
      child: SafeArea(
        bottom: false,
        child: Row(
          children: [
            Expanded(child: Text('Session • ${c.type.name}', style: AppTypography.body.copyWith(fontWeight: FontWeight.w600))),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 6),
              decoration: BoxDecoration(color: AppColors.accentLavender, borderRadius: BorderRadius.circular(AppRadius.chip)),
              child: Text(Money.formatDuration(c.billedSeconds), style: AppTypography.body.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700)),
            ),
            const SizedBox(width: AppSpacing.sm),
            IconButton(onPressed: _end, icon: const Icon(Icons.call_end_rounded, color: AppColors.error)),
          ],
        ),
      ),
    );
  }

  Widget _chatView(Consultation c) {
    final messages = ref.watch(_messagesProvider(_id)).valueOrNull ?? const [];
    return Scaffold(
      body: Column(
        children: [
          _header(c),
          Expanded(
            child: messages.isEmpty
                ? const EmptyState(icon: Icons.chat_bubble_outline_rounded, title: 'Consultation started', message: 'Send a message to begin.')
                : ListView.builder(
                    reverse: true,
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    itemCount: messages.length,
                    itemBuilder: (_, i) {
                      final m = messages[i];
                      final mine = m['senderId'] == widget.self.id;
                      final image = m['image'] as String?;
                      final hasImage = image != null && image.isNotEmpty;
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
                            color: mine ? (hasImage ? AppColors.primary : null) : AppColors.card,
                            borderRadius: BorderRadius.circular(16),
                            boxShadow: mine ? null : AppShadows.soft,
                          ),
                          child: hasImage
                              ? ClipRRect(
                                  borderRadius: BorderRadius.circular(12),
                                  child: Image.network(image, fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) => const Icon(Icons.broken_image_outlined)),
                                )
                              : Text((m['text'] ?? '') as String,
                                  style: AppTypography.body.copyWith(color: mine ? Colors.white : AppColors.textDark)),
                        ),
                      );
                    },
                  ),
          ),
          if (widget.self.quickReplies.isNotEmpty)
            SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                children: [
                  for (final q in widget.self.quickReplies)
                    Padding(
                      padding: const EdgeInsets.only(right: AppSpacing.sm),
                      child: ActionChip(
                        label: Text(q, style: AppTypography.caption.copyWith(color: AppColors.primary)),
                        backgroundColor: AppColors.accentLavender,
                        side: BorderSide.none,
                        onPressed: () {
                          _input.text = q;
                          _input.selection = TextSelection.collapsed(offset: q.length);
                        },
                      ),
                    ),
                ],
              ),
            ),
          Container(
            color: AppColors.card,
            padding: EdgeInsets.only(
                left: AppSpacing.lg, right: AppSpacing.sm, top: AppSpacing.sm,
                bottom: MediaQuery.of(context).viewInsets.bottom + AppSpacing.sm),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _input,
                    minLines: 1,
                    maxLines: 4,
                    decoration: const InputDecoration(hintText: 'Type a reply...', filled: false, border: InputBorder.none),
                  ),
                ),
                IconButton.filled(
                  style: IconButton.styleFrom(backgroundColor: AppColors.primary),
                  onPressed: () => _send(c),
                  icon: const Icon(Icons.send_rounded, color: Colors.white),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _callView(Consultation c) {
    return Scaffold(
      backgroundColor: const Color(0xFF1E1330),
      body: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(
              child: c.type == ConsultationType.video && _remoteUid != null && _engine != null
                  ? AgoraVideoView(
                      controller: VideoViewController.remote(
                        rtcEngine: _engine!,
                        canvas: VideoCanvas(uid: _remoteUid),
                        connection: RtcConnection(channelId: _channel ?? ''),
                      ),
                    )
                  : Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.person, color: Colors.white54, size: 80),
                          const SizedBox(height: AppSpacing.md),
                          Text('Customer • ${Money.formatDuration(c.billedSeconds)}',
                              style: AppTypography.body.copyWith(color: Colors.white70)),
                        ],
                      ),
                    ),
            ),
            Align(
              alignment: Alignment.bottomCenter,
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.xl),
                child: GestureDetector(
                  onTap: _end,
                  child: Container(
                    width: 64,
                    height: 64,
                    decoration: const BoxDecoration(color: AppColors.error, shape: BoxShape.circle),
                    child: const Icon(Icons.call_end_rounded, color: Colors.white, size: 30),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _summaryView(Consultation c) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.check_circle_rounded, size: 72, color: AppColors.success),
              const SizedBox(height: AppSpacing.md),
              Text('Consultation ended', style: AppTypography.title),
              const SizedBox(height: AppSpacing.lg),
              AppCard(
                child: Column(
                  children: [
                    _row('Duration', Money.formatDurationLong(c.duration)),
                    _row('Type', c.type.name),
                    if (c.receiptNo != null) _row('Receipt', c.receiptNo!),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              PrimaryButton(label: 'Done', onPressed: () => Navigator.of(context).pop()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _row(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [Text(k, style: AppTypography.caption), Text(v, style: AppTypography.body)],
        ),
      );
}

// ---- providers scoped to this screen ----
final _sessionProvider = StreamProvider.autoDispose.family<Consultation, String>(
    (ref, id) => ref.watch(consultationServiceProvider).watch(id));

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

final _tokenProvider = FutureProvider.autoDispose.family<AgoraCredentials?, String>((ref, id) async {
  // Reuse the same server-minted Agora token endpoint as the customer app.
  try {
    final res = await ref
        .read(functionsProvider)
        .httpsCallable('generateAgoraToken')
        .call<Map<String, dynamic>>({'consultationId': id, 'agoraUid': 0});
    final m = Map<String, dynamic>.from(res.data);
    return AgoraCredentials(
      token: m['token'] as String,
      appId: m['appId'] as String,
      channel: m['channel'] as String,
      uid: (m['uid'] ?? 0) as int,
    );
  } catch (_) {
    return null;
  }
});
