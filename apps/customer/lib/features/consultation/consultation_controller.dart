import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';

/// Live consultation state the UI renders. All authoritative values (remaining
/// time, wallet, status) come from the backend via the heartbeat + the session
/// listener. The local ticking only smooths the display between heartbeats.
class ConsultationState {
  const ConsultationState({
    required this.consultation,
    required this.displayRemainingSec,
    this.connecting = false,
  });

  final Consultation consultation;
  final int displayRemainingSec;
  final bool connecting;

  int get warnLevel => consultation.warnLevel;
  ConsultationStatus get status => consultation.status;

  ConsultationState copyWith({Consultation? consultation, int? displayRemainingSec, bool? connecting}) =>
      ConsultationState(
        consultation: consultation ?? this.consultation,
        displayRemainingSec: displayRemainingSec ?? this.displayRemainingSec,
        connecting: connecting ?? this.connecting,
      );
}

/// Manages a single active consultation: subscribes to the session document,
/// sends the billing heartbeat every ~10s while active, and counts the display
/// timer down locally each second (never authoritative).
class ConsultationController extends StateNotifier<AsyncValue<ConsultationState>> {
  ConsultationController(this._ref, this.consultationId) : super(const AsyncValue.loading()) {
    _listen();
  }

  final Ref _ref;
  final String consultationId;

  StreamSubscription<Consultation>? _sub;
  Timer? _display;
  Timer? _heartbeat;
  // Guards the network-loss auto-resume so it fires at most once per pause.
  bool _autoResumeAttempted = false;

  ConsultationService get _service => _ref.read(consultationServiceProvider);

  void _listen() {
    _sub = _service.watch(consultationId).listen((c) {
      final base = state.valueOrNull;
      state = AsyncValue.data(
        ConsultationState(
          consultation: c,
          // Trust the backend's remaining seconds on every server update.
          displayRemainingSec: c.remainingSec,
          connecting: base?.connecting ?? false,
        ),
      );
      _syncTimers(c.status);
      _maybeAutoResume(c);
    }, onError: (e, st) => state = AsyncValue.error(e, st),);
  }

  /// Auto-resume a session the server paused due to a dropped connection, the
  /// moment this client is receiving updates again. Only a network-loss pause
  /// (`networkStatus == 'reconnecting'`) with balance left is resumed — never an
  /// exhaustion pause (that needs a recharge) or a terminal state — and only
  /// once per pause, so a failed resume never loops.
  void _maybeAutoResume(Consultation c) {
    if (c.status == ConsultationStatus.active) {
      _autoResumeAttempted = false;
      return;
    }
    if (c.status == ConsultationStatus.paused &&
        c.networkStatus == 'reconnecting' &&
        c.remainingSec > 0 &&
        !_autoResumeAttempted) {
      _autoResumeAttempted = true;
      resume();
    }
  }

  void _syncTimers(ConsultationStatus status) {
    if (status == ConsultationStatus.active) {
      _display ??= Timer.periodic(const Duration(seconds: 1), (_) => _tickDisplay());
      _heartbeat ??= Timer.periodic(const Duration(seconds: 10), (_) => sendHeartbeat());
    } else {
      _display?.cancel();
      _display = null;
      _heartbeat?.cancel();
      _heartbeat = null;
    }
  }

  void _tickDisplay() {
    final s = state.valueOrNull;
    if (s == null) return;
    final next = (s.displayRemainingSec - 1).clamp(0, 1 << 31);
    state = AsyncValue.data(s.copyWith(displayRemainingSec: next));
  }

  Future<void> sendHeartbeat() async {
    await _service.tick(consultationId, networkStatus: 'ok');
    // The session listener will deliver the authoritative update.
  }

  Future<Result<void>> activate() => _service.activate(consultationId);
  Future<Result<void>> resume() => _service.resume(consultationId);
  Future<Result<Consultation>> end() => _service.end(consultationId);
  Future<Result<void>> rate(double rating,
          {String? review, double? behaviorRating, double? accuracyRating,}) =>
      _service.rate(consultationId,
          rating: rating,
          review: review,
          behaviorRating: behaviorRating,
          accuracyRating: accuracyRating,);

  @override
  void dispose() {
    _sub?.cancel();
    _display?.cancel();
    _heartbeat?.cancel();
    super.dispose();
  }
}

final consultationControllerProvider = StateNotifierProvider.autoDispose
    .family<ConsultationController, AsyncValue<ConsultationState>, String>(
  (ref, id) => ConsultationController(ref, id),
);
