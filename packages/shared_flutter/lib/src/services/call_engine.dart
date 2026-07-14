import 'package:agora_rtc_engine/agora_rtc_engine.dart';
import 'package:flutter/foundation.dart';

/// Connection phase of a live call, surfaced to the UI.
enum CallPhase { idle, connecting, connected, ended, failed }

/// A thin, shared wrapper over the Agora RTC engine for a 1:1 voice OR video
/// call. One instance backs each call screen in either app. It owns the media
/// session (join/leave, publish mic + optional camera, subscribe to the peer)
/// and the in-call controls (mute, speaker, camera). Billing, ringing and
/// lifecycle stay server-driven — this only handles media.
class CallEngine extends ChangeNotifier {
  RtcEngine? _engine;

  /// The live engine, exposed so screens can render Agora video surfaces.
  RtcEngine? get engine => _engine;

  CallPhase phase = CallPhase.idle;

  /// True once the OTHER participant is in the channel — the point at which the
  /// call is really "connected" (before that we are alone, still "connecting").
  bool remoteJoined = false;
  int? remoteUid;
  String? channel;
  bool isVideo = false;

  bool muted = false;
  bool speakerOn = false;
  bool cameraOn = true;
  String? errorMessage;

  bool get isLive => phase == CallPhase.connected;

  /// Initialise the engine and join [channel] with the server-minted [token] and
  /// [uid]. Publishes the mic always and the camera when [video] is true.
  /// Idempotent — a second call is ignored while a session is already up.
  Future<void> join({
    required String appId,
    required String token,
    required String channel,
    required int uid,
    bool video = false,
  }) async {
    if (_engine != null) return;
    isVideo = video;
    this.channel = channel;
    // Video calls default to the loudspeaker; voice calls to the earpiece.
    speakerOn = video;
    phase = CallPhase.connecting;
    remoteJoined = false;
    errorMessage = null;
    notifyListeners();

    try {
      final engine = createAgoraRtcEngine();
      _engine = engine;
      await engine.initialize(RtcEngineContext(
        appId: appId,
        channelProfile: ChannelProfileType.channelProfileCommunication,
      ),);

      engine.registerEventHandler(RtcEngineEventHandler(
        onJoinChannelSuccess: (RtcConnection connection, int elapsed) async {
          // The audio session only exists AFTER joining, so the speaker route
          // must be applied here — calling it before join returns -3 (NOT_READY).
          try {
            await engine.setEnableSpeakerphone(speakerOn);
          } catch (_) {/* non-fatal */}
          if (phase == CallPhase.connecting && remoteJoined) {
            phase = CallPhase.connected;
          }
          notifyListeners();
        },
        onUserJoined: (RtcConnection connection, int uid, int elapsed) {
          remoteUid = uid;
          remoteJoined = true;
          phase = CallPhase.connected;
          notifyListeners();
        },
        onUserOffline:
            (RtcConnection connection, int uid, UserOfflineReasonType reason) {
          // The peer dropped. The authoritative end is driven by the billing
          // session (Firestore), so we only reflect it here — we do NOT tear the
          // call down, so a brief reconnect can re-join without ending billing.
          remoteJoined = false;
          remoteUid = null;
          notifyListeners();
        },
        // Surfaces WHY a join fails (invalid token, uid clash, rejected, …).
        onConnectionStateChanged: (RtcConnection connection,
            ConnectionStateType state, ConnectionChangedReasonType reason,) {
          if (state == ConnectionStateType.connectionStateFailed) {
            phase = CallPhase.failed;
            errorMessage = 'Connection failed (${reason.name})';
            notifyListeners();
          }
        },
        onError: (ErrorCodeType err, String msg) {
          errorMessage = 'Agora ${err.name}: $msg';
          notifyListeners();
        },
      ),);

      await engine.enableAudio();
      if (video) {
        await engine.enableVideo();
        await engine.startPreview();
      }

      await engine.joinChannel(
        token: token,
        channelId: channel,
        uid: uid,
        options: ChannelMediaOptions(
          clientRoleType: ClientRoleType.clientRoleBroadcaster,
          channelProfile: ChannelProfileType.channelProfileCommunication,
          publishMicrophoneTrack: true,
          publishCameraTrack: video,
          autoSubscribeAudio: true,
          autoSubscribeVideo: video,
        ),
      );
    } catch (e) {
      phase = CallPhase.failed;
      errorMessage = e.toString();
      notifyListeners();
    }
  }

  Future<void> toggleMute() async {
    muted = !muted;
    notifyListeners();
    await _engine?.muteLocalAudioStream(muted);
  }

  Future<void> toggleSpeaker() async {
    speakerOn = !speakerOn;
    notifyListeners();
    await _engine?.setEnableSpeakerphone(speakerOn);
  }

  Future<void> toggleCamera() async {
    cameraOn = !cameraOn;
    notifyListeners();
    await _engine?.enableLocalVideo(cameraOn);
  }

  Future<void> switchCamera() async {
    await _engine?.switchCamera();
  }

  /// Leave the channel and free native resources. Safe to call more than once.
  Future<void> leave() async {
    final engine = _engine;
    _engine = null;
    if (phase != CallPhase.failed) phase = CallPhase.ended;
    if (engine == null) return;
    try {
      await engine.leaveChannel();
    } catch (_) {/* best-effort */}
    try {
      await engine.release();
    } catch (_) {/* best-effort */}
  }

  @override
  void dispose() {
    // Fire-and-forget native teardown; no notifyListeners after dispose.
    leave();
    super.dispose();
  }
}
