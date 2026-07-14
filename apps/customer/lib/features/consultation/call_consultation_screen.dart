import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../data/messaging_service.dart';
import 'consultation_controller.dart';
import 'consultation_end.dart';

/// The customer's live VOICE call screen. Mirrors the chat screen's billing
/// lifecycle (heartbeat, low-balance nudges, grace minute, pause/resume, rate)
/// but talks over Agora instead of a message thread. It shows a "Calling…"
/// ringback while the astrologer's session is still `waiting`, joins the audio
/// channel the moment they accept (`active`), and runs the standard end/rate
/// flow when the session finishes.
class CallConsultationScreen extends ConsumerStatefulWidget {
  const CallConsultationScreen({
    super.key,
    required this.consultationId,
    required this.astrologer,
  });
  final String consultationId;
  final Astrologer astrologer;

  @override
  ConsumerState<CallConsultationScreen> createState() => _CallConsultationScreenState();
}

class _CallConsultationScreenState extends ConsumerState<CallConsultationScreen> {
  bool _lowBalanceShown = false;
  bool _graceShown = false;
  bool _leftForTerminal = false;
  bool _pausedShown = false;

  CallEngine? _call;
  bool _callJoinStarted = false;

  // Local 1-second stopwatch for a smooth in-call timer between server ticks.
  Timer? _uiTick;
  DateTime? _activeSince;

  String get _id => widget.consultationId;

  @override
  void dispose() {
    _uiTick?.cancel();
    _call?.removeListener(_onCallChanged);
    _call?.leave();
    super.dispose();
  }

  void _onCallChanged() {
    if (mounted) setState(() {});
  }

  int get _elapsed => _activeSince == null ? 0 : DateTime.now().difference(_activeSince!).inSeconds;

  static String _mmss(int s) {
    final v = s < 0 ? 0 : s;
    return '${v ~/ 60}:${(v % 60).toString().padLeft(2, '0')}';
  }

  /// Join the Agora channel once the astrologer accepts; leave on terminal.
  void _ensureCall(Consultation c) {
    if (c.status == ConsultationStatus.active) {
      _activeSince ??= DateTime.now();
      _uiTick ??= Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() {});
      });
      if (_call == null && !_callJoinStarted) {
        _callJoinStarted = true;
        _joinCall(c);
      }
    } else if (c.status.isTerminal && _call != null) {
      _call!.removeListener(_onCallChanged);
      _call!.leave();
      _call = null;
    }
  }

  Future<void> _joinCall(Consultation c) async {
    final mic = await Permission.microphone.request();
    if (!mic.isGranted) {
      _toast('Microphone permission is needed for the call.');
      return;
    }
    if (!mounted) return;
    final engine = CallEngine()..addListener(_onCallChanged);
    _call = engine;
    final tok = await ref.read(rtcTokenServiceProvider).tokenFor(c.id);
    tok.when(
      success: (cred) => engine.joinVoice(
        appId: cred.appId,
        token: cred.token,
        channel: cred.channel,
        uid: cred.uid,
      ),
      failure: (f) => _toast('Could not connect the call: ${f.message}'),
    );
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  // ---- billing lifecycle (shared shape with the chat screen) ----

  void _maybeHandleTerminal(ConsultationState s) {
    if (_leftForTerminal || !mounted) return;
    final c = s.consultation;
    if (!c.status.isTerminal) return;
    _leftForTerminal = true;
    if (_pausedShown) {
      Navigator.of(context).maybePop();
      _pausedShown = false;
    }
    final everStarted = c.billedSeconds > 0 || c.duration > 0;
    if (everStarted) {
      showConsultationEnd(context, ref, consultation: c, astrologer: widget.astrologer);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text("The astrologer couldn't take your call right now — you haven't been charged."),
      ),);
      Navigator.of(context).maybePop();
    }
  }

  Future<void> _handleWarn(ConsultationState s) async {
    if (s.consultation.graceGranted && !_graceShown) {
      _graceShown = true;
      _lowBalanceShown = true;
      if (mounted) await showGraceBonusDialog(context, minutes: 1);
      return;
    }
    if (s.warnLevel == 1 && !_lowBalanceShown) {
      _lowBalanceShown = true;
      final recharge = await showLowBalanceDialog(context, remainingSec: s.displayRemainingSec);
      if (recharge == true && mounted) _goRecharge();
    }
    if (s.warnLevel < 1) _lowBalanceShown = false;

    if (s.status == ConsultationStatus.paused && !_pausedShown && mounted) {
      await _showPaused();
    }
  }

  Future<void> _showPaused() async {
    _pausedShown = true;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => Dialog(
        insetPadding: const EdgeInsets.all(AppSpacing.xl),
        backgroundColor: AppColors.card,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.dialog)),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.pause_circle_filled_rounded, size: 56, color: AppColors.primary),
              const SizedBox(height: AppSpacing.md),
              Text('Call Paused', style: AppTypography.subtitle, textAlign: TextAlign.center),
              const SizedBox(height: AppSpacing.xs),
              Text('Recharge now to continue the call where you left off.',
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
                label: 'End Call',
                onPressed: () {
                  Navigator.pop(context);
                  _end(confirm: false);
                },
              ),
            ],
          ),
        ),
      ),
    );
    _pausedShown = false;
  }

  Future<void> _goRecharge() async {
    await context.push('/recharge');
    if (mounted) await ref.read(consultationControllerProvider(_id).notifier).resume();
  }

  Future<void> _end({bool confirm = true}) async {
    if (confirm) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('End call?'),
          content: const Text('You will be billed for the time used so far.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            DestructiveButton(label: 'End', onPressed: () => Navigator.pop(context, true)),
          ],
        ),
      );
      if (ok != true) return;
    }
    _leftForTerminal = true;
    _call?.leave();
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
      failure: (f) {
        _leftForTerminal = false;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message)));
      },
    );
  }

  /// Cancel a call that hasn't been accepted yet (still ringing).
  Future<void> _cancelRinging() async {
    _leftForTerminal = true;
    await ref.read(consultationControllerProvider(_id).notifier).end();
    if (mounted) Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(consultationControllerProvider(_id));
    ref.listen(consultationControllerProvider(_id), (_, next) {
      final s = next.valueOrNull;
      if (s == null) return;
      _ensureCall(s.consultation);
      _handleWarn(s);
      _maybeHandleTerminal(s);
    });

    return Scaffold(
      backgroundColor: const Color(0xFF2A1E52),
      body: async.when(
        loading: () => const _CallShell(child: Center(child: CircularProgressIndicator(color: Colors.white))),
        error: (_, __) => _CallShell(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text('Connection lost.', style: TextStyle(color: Colors.white, fontSize: 16)),
                const SizedBox(height: 16),
                SecondaryButton(label: 'Go back', onPressed: () => Navigator.of(context).maybePop()),
              ],),
            ),
          ),
        ),
        data: (s) {
          _ensureCall(s.consultation);
          final c = s.consultation;
          if (c.status == ConsultationStatus.waiting) return _ringingView();
          return _inCallView(c);
        },
      ),
    );
  }

  Widget _ringingView() {
    final a = widget.astrologer;
    return _CallShell(
      child: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 40),
            _Pulse(child: _avatar(a, 128)),
            const SizedBox(height: 22),
            Text(a.name,
                style: AppTypography.title.copyWith(color: Colors.white), textAlign: TextAlign.center,),
            const SizedBox(height: 8),
            Text('Calling…', style: AppTypography.body.copyWith(color: Colors.white70)),
            const Spacer(),
            _callBtn(Icons.call_end_rounded, AppColors.error, _cancelRinging, size: 68),
            const SizedBox(height: 12),
            Text('Cancel', style: AppTypography.caption.copyWith(color: Colors.white70)),
            const SizedBox(height: 30),
          ],
        ),
      ),
    );
  }

  Widget _inCallView(Consultation c) {
    final a = widget.astrologer;
    final call = _call;
    final connecting = call == null || !call.isLive;
    final muted = call?.muted ?? false;
    final speaker = call?.speakerOn ?? false;
    return _CallShell(
      child: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 40),
            _avatar(a, 120),
            const SizedBox(height: 20),
            Text(a.name,
                style: AppTypography.title.copyWith(color: Colors.white), textAlign: TextAlign.center,),
            const SizedBox(height: 8),
            Text(connecting ? 'Connecting…' : _mmss(_elapsed),
                style: AppTypography.body.copyWith(color: Colors.white70),),
            if (call?.errorMessage != null) ...[
              const SizedBox(height: 6),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Text(call!.errorMessage!,
                    textAlign: TextAlign.center,
                    style: AppTypography.caption.copyWith(color: AppColors.warning),),
              ),
            ],
            const Spacer(),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _callBtn(muted ? Icons.mic_off_rounded : Icons.mic_rounded,
                    muted ? AppColors.error : Colors.white24, () => call?.toggleMute(),),
                const SizedBox(width: 20),
                _callBtn(Icons.call_end_rounded, AppColors.error, () => _end(), size: 68),
                const SizedBox(width: 20),
                _callBtn(Icons.volume_up_rounded,
                    speaker ? AppColors.primary : Colors.white24, () => call?.toggleSpeaker(),),
              ],
            ),
            const SizedBox(height: 34),
          ],
        ),
      ),
    );
  }

  Widget _avatar(Astrologer a, double size) => Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white24, width: 2),
        ),
        child: AppAvatar(name: a.name, photoUrl: a.profilePhoto, size: size),
      );

  Widget _callBtn(IconData icon, Color bg, VoidCallback onTap, {double size = 60}) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
          child: Icon(icon, color: Colors.white, size: size * 0.42),
        ),
      );
}

/// Shared celestial background for the ringing + in-call states.
class _CallShell extends StatelessWidget {
  const _CallShell({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF8A63D2), Color(0xFF5E3FBE), Color(0xFF2A1E52)],
        ),
      ),
      child: child,
    );
  }
}

/// Gentle pulsing halo used behind the ringing avatar.
class _Pulse extends StatefulWidget {
  const _Pulse({required this.child});
  final Widget child;
  @override
  State<_Pulse> createState() => _PulseState();
}

class _PulseState extends State<_Pulse> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, child) {
        final t = _c.value;
        return SizedBox(
          width: 200,
          height: 200,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: 150 + 50 * t,
                height: 150 + 50 * t,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.16 * (1 - t)),
                ),
              ),
              child!,
            ],
          ),
        );
      },
      child: widget.child,
    );
  }
}
