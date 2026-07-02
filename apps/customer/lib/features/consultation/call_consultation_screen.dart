import 'package:agora_rtc_engine/agora_rtc_engine.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import 'consultation_controller.dart';
import 'consultation_end.dart';

/// Voice/Video consultation over Agora. The billing heartbeat + timer are the
/// same server-authoritative controller used by chat; this screen adds the RTC
/// engine, media controls, and the call layout.
class CallConsultationScreen extends ConsumerStatefulWidget {
  const CallConsultationScreen({
    super.key,
    required this.consultationId,
    required this.astrologer,
    required this.video,
  });

  final String consultationId;
  final Astrologer astrologer;
  final bool video;

  @override
  ConsumerState<CallConsultationScreen> createState() => _CallConsultationScreenState();
}

class _CallConsultationScreenState extends ConsumerState<CallConsultationScreen> {
  RtcEngine? _engine;
  int? _remoteUid;
  String? _channel;
  bool _muted = false;
  bool _speaker = true;
  bool _joined = false;
  bool _lowBalanceShown = false;
  String? _error;

  String get _id => widget.consultationId;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    // Permissions.
    final perms = widget.video
        ? [Permission.microphone, Permission.camera]
        : [Permission.microphone];
    await perms.request();

    final tokenRes = await ref.read(rtcTokenServiceProvider).tokenFor(_id);
    final creds = tokenRes.valueOrNull;
    if (creds == null) {
      setState(() => _error = 'Could not join the call. Please try again.');
      return;
    }

    final engine = createAgoraRtcEngine();
    await engine.initialize(RtcEngineContext(appId: creds.appId));
    _engine = engine;
    _channel = creds.channel;

    engine.registerEventHandler(RtcEngineEventHandler(
      onJoinChannelSuccess: (conn, elapsed) {
        setState(() => _joined = true);
        // Chat/voice/video all bill identically — activate on connect.
        ref.read(consultationControllerProvider(_id).notifier).activate();
      },
      onUserJoined: (conn, uid, elapsed) => setState(() => _remoteUid = uid),
      onUserOffline: (conn, uid, reason) => setState(() => _remoteUid = null),
    ));

    if (widget.video) {
      await engine.enableVideo();
      await engine.startPreview();
    } else {
      await engine.enableAudio();
    }
    await engine.setEnableSpeakerphone(_speaker);

    await engine.joinChannel(
      token: creds.token,
      channelId: creds.channel,
      uid: creds.uid,
      options: ChannelMediaOptions(
        channelProfile: ChannelProfileType.channelProfileCommunication,
        clientRoleType: ClientRoleType.clientRoleBroadcaster,
        publishCameraTrack: widget.video,
        publishMicrophoneTrack: true,
      ),
    );
  }

  Future<void> _toggleMute() async {
    _muted = !_muted;
    await _engine?.muteLocalAudioStream(_muted);
    setState(() {});
  }

  Future<void> _toggleSpeaker() async {
    _speaker = !_speaker;
    await _engine?.setEnableSpeakerphone(_speaker);
    setState(() {});
  }

  Future<void> _switchCamera() => _engine?.switchCamera() ?? Future.value();

  Future<void> _end() async {
    final r = await ref.read(consultationControllerProvider(_id).notifier).end();
    await _leave();
    if (!mounted) return;
    r.when(
      success: (c) => showConsultationEnd(context, ref, consultation: c, astrologer: widget.astrologer),
      failure: (_) => context.go('/home'),
    );
  }

  Future<void> _leave() async {
    await _engine?.leaveChannel();
    await _engine?.release();
    _engine = null;
  }

  Future<void> _handleWarn(ConsultationState s) async {
    if (s.warnLevel == 1 && !_lowBalanceShown) {
      _lowBalanceShown = true;
      final recharge = await showLowBalanceDialog(context, remainingSec: s.displayRemainingSec);
      if (recharge == true && mounted) {
        await context.push('/recharge');
        if (mounted) await ref.read(consultationControllerProvider(_id).notifier).resume();
      }
    }
    if (s.warnLevel < 1) _lowBalanceShown = false;
    if (s.status == ConsultationStatus.paused && mounted) {
      await context.push('/recharge');
      if (mounted) await ref.read(consultationControllerProvider(_id).notifier).resume();
    }
  }

  @override
  void dispose() {
    _leave();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(consultationControllerProvider(_id), (_, next) {
      final s = next.valueOrNull;
      if (s != null) _handleWarn(s);
    });
    final s = ref.watch(consultationControllerProvider(_id)).valueOrNull;
    final remaining = s?.displayRemainingSec ?? 0;
    final warn = s?.warnLevel ?? 0;

    return Scaffold(
      backgroundColor: const Color(0xFF1E1330),
      body: SafeArea(
        child: _error != null
            ? ErrorStateView(message: _error!, onRetry: () { setState(() => _error = null); _bootstrap(); })
            : Stack(
                children: [
                  // Remote video / avatar backdrop.
                  Positioned.fill(
                    child: widget.video && _remoteUid != null && _engine != null
                        ? AgoraVideoView(
                            controller: VideoViewController.remote(
                              rtcEngine: _engine!,
                              canvas: VideoCanvas(uid: _remoteUid),
                              connection: RtcConnection(channelId: _channel ?? ''),
                            ),
                          )
                        : _AvatarBackdrop(astrologer: widget.astrologer, joined: _joined),
                  ),

                  // Local preview (video only).
                  if (widget.video && _engine != null && _joined)
                    Positioned(
                      right: AppSpacing.lg,
                      top: AppSpacing.lg,
                      width: 110,
                      height: 160,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: AgoraVideoView(
                          controller: VideoViewController(
                            rtcEngine: _engine!,
                            canvas: const VideoCanvas(uid: 0),
                          ),
                        ),
                      ),
                    ),

                  // Top: identity + timer.
                  Positioned(
                    top: AppSpacing.lg,
                    left: AppSpacing.lg,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(widget.astrologer.name,
                            style: AppTypography.subtitle.copyWith(color: Colors.white)),
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: (warn >= 2 ? AppColors.error : Colors.white).withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(Money.formatDuration(remaining),
                              style: AppTypography.body.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                        ),
                      ],
                    ),
                  ),

                  // Bottom controls.
                  Align(
                    alignment: Alignment.bottomCenter,
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.xl),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          _CtrlButton(icon: _muted ? Icons.mic_off : Icons.mic, label: 'Mute', active: _muted, onTap: _toggleMute),
                          _CtrlButton(icon: _speaker ? Icons.volume_up : Icons.volume_down, label: 'Speaker', active: _speaker, onTap: _toggleSpeaker),
                          if (widget.video)
                            _CtrlButton(icon: Icons.cameraswitch_rounded, label: 'Flip', onTap: _switchCamera),
                          _CtrlButton(icon: Icons.add_circle, label: 'Recharge', onTap: () => context.push('/recharge')),
                          _CtrlButton(icon: Icons.call_end_rounded, label: 'End', danger: true, onTap: _end),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class _AvatarBackdrop extends StatelessWidget {
  const _AvatarBackdrop({required this.astrologer, required this.joined});
  final Astrologer astrologer;
  final bool joined;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AppAvatar(name: astrologer.name, photoUrl: astrologer.profilePhoto, size: 120),
          const SizedBox(height: AppSpacing.lg),
          Text(joined ? 'Connected' : 'Connecting…',
              style: AppTypography.body.copyWith(color: Colors.white70)),
        ],
      ),
    );
  }
}

class _CtrlButton extends StatelessWidget {
  const _CtrlButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.active = false,
    this.danger = false,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final bg = danger ? AppColors.error : (active ? AppColors.primary : Colors.white24);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: onTap,
          child: Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
            child: Icon(icon, color: Colors.white),
          ),
        ),
        const SizedBox(height: 6),
        Text(label, style: AppTypography.caption.copyWith(color: Colors.white70, fontSize: 12)),
      ],
    );
  }
}
