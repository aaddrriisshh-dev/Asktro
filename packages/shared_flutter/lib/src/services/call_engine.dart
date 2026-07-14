import 'package:agora_rtc_engine/agora_rtc_engine.dart';
import 'package:flutter/foundation.dart';

/// Connection phase of a live voice call, surfaced to the UI.
enum CallPhase { idle, connecting, connected, ended, failed }

/// A thin, shared wrapper over the Agora RTC engine for a 1:1 VOICE call. One
/// instance backs each call screen in either app. It owns the media session
/// (join/leave, publish mic, subscribe to the peer) and the in-call controls
/// (mute, speaker). Billing, ringing and lifecycle stay server-driven — this
/// only handles audio. Video is layered on in a later phase.
class CallEngine extends ChangeNotifier {
  RtcEngine? _engine;

  CallPhase phase = CallPhase.idle;

  /// True once the OTHER participant is in the channel — the point at which the
  /// call is really "connected" (before that we are alone, still "connecting").
  bool remoteJoined = false;
  bool muted = false;
  bool speakerOn = false;
  String? errorMessage;

  bool get isLive => phase == CallPhase.connected;

  /// Initialise the engine and join [channel] with the server-minted [token] and
  /// [uid] as a voice publisher. Idempotent — a second call is ignored while a
  /// session is already up.
  Future<void> joinVoice({
    required String appId,
    required String token,
    required String channel,
    required int uid,
  }) async {
    if (_engine != null) return;
    phase = CallPhase.connecting;
    remoteJoined = false;
    errorMessage = null;
    notifyListeners();

    try {
      final engine = createAgoraRtcEngine();
      _engine = engine;
      await engine.initialize(RtcEngineContext(appId: appId));

      engine.registerEventHandler(RtcEngineEventHandler(
        onJoinChannelSuccess: (RtcConnection connection, int elapsed) {
          // We're in the channel; stay "connecting" until the peer appears.
          if (phase == CallPhase.connecting && remoteJoined) {
            phase = CallPhase.connected;
          }
          notifyListeners();
        },
        onUserJoined: (RtcConnection connection, int remoteUid, int elapsed) {
          remoteJoined = true;
          phase = CallPhase.connected;
          notifyListeners();
        },
        onUserOffline:
            (RtcConnection connection, int remoteUid, UserOfflineReasonType reason) {
          // The peer dropped. The authoritative end is driven by the billing
          // session (Firestore), so we only reflect it here — we do NOT tear the
          // call down, so a brief reconnect can re-join without ending billing.
          remoteJoined = false;
          notifyListeners();
        },
        // Surfaces WHY a join fails (invalid token, uid clash, rejected, …) so
        // the UI can show it instead of an endless "Connecting…".
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
      // Voice call: default to the earpiece like a normal phone call; the user
      // can flip to speaker with the in-call button.
      await engine.setEnableSpeakerphone(false);

      await engine.joinChannel(
        token: token,
        channelId: channel,
        uid: uid,
        options: const ChannelMediaOptions(
          clientRoleType: ClientRoleType.clientRoleBroadcaster,
          channelProfile: ChannelProfileType.channelProfileCommunication,
          publishMicrophoneTrack: true,
          autoSubscribeAudio: true,
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
