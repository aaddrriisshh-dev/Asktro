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
        // DIAGNOSTIC (pre-launch): surface EVERY connection transition + reason
        // so a call that drops after a few seconds tells us exactly WHY on
        // screen — e.g. invalidToken / tokenExpired / invalidAppId (credentials)
        // vs interrupted / keepAliveTimeout (network/UDP can't reach Agora). A
        // deliberate leave and the normal join are NOT treated as errors.
        onConnectionStateChanged: (RtcConnection connection,
            ConnectionStateType state, ConnectionChangedReasonType reason,) {
          final r = reason.name;
          if (r != 'connectionChangedLeaveChannel' &&
              r != 'connectionChangedJoinSuccess') {
            errorMessage = 'Conn: ${state.name} · $r';
          }
          if (state == ConnectionStateType.connectionStateFailed) {
            phase = CallPhase.failed;
          }
          debugPrint('CallEngine conn: ${state.name} / $r');
          notifyListeners();
        },
        // Fires ~10s after the media link can no longer be sustained (the classic
        // "connects then drops" symptom). Signaling had succeeded, so App ID +
        // token were accepted — this points at the network/UDP path to Agora.
        onConnectionLost: (RtcConnection connection) {
          errorMessage = 'Connection lost — network/UDP could not reach Agora.';
          debugPrint('CallEngine: onConnectionLost');
          notifyListeners();
        },
        // Agora asks for a fresh token — means the current one was rejected or
        // expired (App Certificate / App ID mismatch is the usual cause).
        onRequestToken: (RtcConnection connection) {
          errorMessage = 'Token rejected — App ID / Certificate likely mismatched.';
          debugPrint('CallEngine: onRequestToken');
          notifyListeners();
        },
        onTokenPrivilegeWillExpire: (RtcConnection connection, String token) {
          debugPrint('CallEngine: onTokenPrivilegeWillExpire');
          notifyListeners();
        },
        onError: (ErrorCodeType err, String msg) {
          errorMessage = 'Agora ${err.name}: $msg';
          debugPrint('CallEngine error: ${err.name} / $msg');
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

  // In-call controls are best-effort: the native engine can return an error
  // code (e.g. toggled mid-reconnect, just as the channel drops, or an op the
  // device/profile doesn't support), which the plugin surfaces as a thrown
  // AgoraRtcException. Swallowing it here keeps a stray control tap from
  // becoming a fatal unhandled async error (Crashlytics AgoraRtcException).
  Future<void> toggleMute() async {
    muted = !muted;
    notifyListeners();
    try {
      await _engine?.muteLocalAudioStream(muted);
    } catch (e) {
      debugPrint('CallEngine.toggleMute failed: $e');
    }
  }

  Future<void> toggleSpeaker() async {
    speakerOn = !speakerOn;
    notifyListeners();
    try {
      await _engine?.setEnableSpeakerphone(speakerOn);
    } catch (e) {
      debugPrint('CallEngine.toggleSpeaker failed: $e');
    }
  }

  Future<void> toggleCamera() async {
    cameraOn = !cameraOn;
    notifyListeners();
    try {
      await _engine?.enableLocalVideo(cameraOn);
    } catch (e) {
      debugPrint('CallEngine.toggleCamera failed: $e');
    }
  }

  Future<void> switchCamera() async {
    try {
      await _engine?.switchCamera();
    } catch (e) {
      debugPrint('CallEngine.switchCamera failed: $e');
    }
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
