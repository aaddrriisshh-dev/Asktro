import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../data/astrologer_repository.dart';
import '../../ui/celestial.dart';
import '../../ui/customer_insight.dart';
import 'astrologer_consultation_screen.dart';

/// Live view of the incoming consultation, so the ring auto-dismisses the moment
/// the customer cancels or the server expires the request.
final _incomingWatchProvider = StreamProvider.autoDispose.family<Consultation, String>(
  (ref, id) => ref.watch(consultationServiceProvider).watch(id),
);

/// An invisible sentinel mounted at the dashboard root. It watches the
/// astrologer's sessions and, the moment a genuinely NEW waiting request
/// arrives, throws up the full-screen ringing screen — the Uber-style incoming
/// call. Existing requests present at app-open are seeded silently so reopening
/// the app never re-rings, and only fresh requests (within the server's request
/// timeout window) ring.
class IncomingCallGate extends ConsumerStatefulWidget {
  const IncomingCallGate({required this.self, super.key});
  final Astrologer self;

  @override
  ConsumerState<IncomingCallGate> createState() => _IncomingCallGateState();
}

class _IncomingCallGateState extends ConsumerState<IncomingCallGate> {
  final Set<String> _known = {};
  bool _seeded = false;
  bool _ringing = false;

  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<List<SessionRow>>>(sessionRowsProvider, (_, next) {
      final rows = next.valueOrNull;
      if (rows == null) return;
      final waiting =
          rows.where((r) => r.c.status == ConsultationStatus.waiting).toList();
      final waitingIds = waiting.map((r) => r.c.id).toSet();

      // First real snapshot establishes the baseline — never ring for requests
      // that were already pending when the app opened.
      if (!_seeded) {
        _known
          ..clear()
          ..addAll(waitingIds);
        _seeded = true;
        return;
      }

      // Forget requests that are no longer waiting so an id is never stale.
      _known.removeWhere((id) => !waitingIds.contains(id));

      for (final r in waiting) {
        if (_known.contains(r.c.id)) continue;
        _known.add(r.c.id);
        final ageMs = DateTime.now().millisecondsSinceEpoch - (r.createdAtMs ?? 0);
        // Only ring for a fresh request, one at a time, and only while online.
        if (!_ringing && ageMs < 100000 && (widget.self.onlineStatus)) {
          _ring(r);
          break;
        }
      }
    });
    return const SizedBox.shrink();
  }

  Future<void> _ring(SessionRow row) async {
    _ringing = true;
    // A transparent route so the dimmed app shows behind the sliding card.
    await Navigator.of(context, rootNavigator: true).push(
      PageRouteBuilder<void>(
        opaque: false,
        barrierColor: Colors.transparent,
        transitionDuration: const Duration(milliseconds: 320),
        reverseTransitionDuration: const Duration(milliseconds: 220),
        pageBuilder: (_, __, ___) => IncomingCallScreen(row: row, self: widget.self),
        transitionsBuilder: (_, anim, __, child) => FadeTransition(
          opacity: anim,
          child: SlideTransition(
            position: Tween<Offset>(begin: const Offset(0, 0.14), end: Offset.zero)
                .animate(CurvedAnimation(parent: anim, curve: Curves.easeOutCubic)),
            child: child,
          ),
        ),
      ),
    );
    _ringing = false;
  }
}

/// The full-screen ringing experience: a looping celestial ringtone, a pulsing
/// avatar, the caller's identity, and large Decline / Accept controls. Auto
/// dismisses on timeout or if the customer cancels first.
class IncomingCallScreen extends ConsumerStatefulWidget {
  const IncomingCallScreen({required this.row, required this.self, super.key});
  final SessionRow row;
  final Astrologer self;

  @override
  ConsumerState<IncomingCallScreen> createState() => _IncomingCallScreenState();
}

class _IncomingCallScreenState extends ConsumerState<IncomingCallScreen>
    with SingleTickerProviderStateMixin {
  final AudioPlayer _player = AudioPlayer();
  late final AnimationController _pulse =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))
        ..repeat(reverse: true);
  Timer? _timeout;
  Timer? _vibrate;
  bool _acting = false;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    try {
      await _player.setReleaseMode(ReleaseMode.loop);
      await _player.setVolume(1.0);
      await _player.play(AssetSource('audio/incoming_ring.wav'));
    } catch (_) {/* audio unavailable — the visual ring still shows */}
    // A gentle repeating buzz alongside the tone.
    HapticFeedback.heavyImpact();
    _vibrate = Timer.periodic(const Duration(milliseconds: 1200), (_) {
      HapticFeedback.heavyImpact();
    });
    // Give up after ~45s — the server also expires the request on its own.
    _timeout = Timer(const Duration(seconds: 45), () {
      if (mounted) _decline();
    });
  }

  Future<void> _stop() async {
    _timeout?.cancel();
    _vibrate?.cancel();
    try {
      await _player.stop();
      await _player.release();
    } catch (_) {}
  }

  @override
  void dispose() {
    _timeout?.cancel();
    _vibrate?.cancel();
    _player.dispose();
    _pulse.dispose();
    super.dispose();
  }

  Future<void> _accept() async {
    if (_acting) return;
    setState(() => _acting = true);
    await _stop();
    final res = await ref.read(consultationServiceProvider).accept(widget.row.c.id);
    if (!mounted) return;
    Navigator.of(context).pop(); // close the ring
    res.when(
      success: (_) => Navigator.of(context, rootNavigator: true).push(
        MaterialPageRoute<void>(
          builder: (_) =>
              AstrologerConsultationScreen(consultationId: widget.row.c.id, self: widget.self),
        ),
      ),
      failure: (f) => ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(f.message))),
    );
  }

  Future<void> _decline() async {
    if (_acting) return;
    setState(() => _acting = true);
    await _stop();
    await ref.read(consultationServiceProvider).decline(widget.row.c.id);
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    // Auto-dismiss if the customer cancels or the server expires the request.
    ref.listen(_incomingWatchProvider(widget.row.c.id), (_, next) {
      final c = next.valueOrNull;
      if (c != null && c.status != ConsultationStatus.waiting && !_acting) {
        _stop();
        if (mounted) Navigator.of(context).pop();
      }
    });

    final cust = ref.watch(customerProvider(widget.row.c.customerId)).valueOrNull;
    final name = cust?.name ?? 'A customer';
    final type = widget.row.c.type;
    final insight = CustomerInsight(cust);
    final sign = insight.sunSign;
    final age = insight.age;
    final chip = <String>[
      if (sign != '—') sign,
      if (age != null) '$age yrs',
    ].join(' · ');

    return PopScope(
      canPop: false, // must Accept or Decline — no accidental back-swipe
      child: Material(
        type: MaterialType.transparency,
        child: Stack(
          children: [
            // Dim the app behind the card; absorb taps so nothing leaks through
            // and tapping outside the card never dismisses it.
            Positioned.fill(
              child: GestureDetector(
                onTap: () {},
                behavior: HitTestBehavior.opaque,
                child: ColoredBox(color: Colors.black.withValues(alpha: 0.58)),
              ),
            ),
            // The overlay card — ~68% of the screen, sliding up from the bottom.
            Align(
              alignment: Alignment.bottomCenter,
              child: FractionallySizedBox(
                heightFactor: 0.68,
                widthFactor: 1,
                child: Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Color(0xFFFBF8FF), Color(0xFFF1E9FF)],
                    ),
                    borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
                    boxShadow: [BoxShadow(color: Color(0x66000000), blurRadius: 34, offset: Offset(0, -10))],
                  ),
                  child: SafeArea(
                    top: false,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(26, 12, 26, 22),
                      child: Column(
                        children: [
                          Container(
                            width: 40, height: 4,
                            decoration: BoxDecoration(
                              color: const Color(0xFFCBBFE8), borderRadius: BorderRadius.circular(99),),
                          ),
                          const SizedBox(height: 14),
                          Text('INCOMING ${type.name.toUpperCase()} CONSULTATION',
                              style: Sky.label.copyWith(
                                  color: Sky.purple, letterSpacing: 1.8, fontSize: 11.5, fontWeight: FontWeight.w800,),),
                          const SizedBox(height: 20),
                          // Pulsing halo around the caller's avatar.
                          AnimatedBuilder(
                            animation: _pulse,
                            builder: (_, __) {
                              final s = 1 + _pulse.value * 0.12;
                              return SizedBox(
                                width: 128, height: 128,
                                child: Center(
                                  child: Container(
                                    width: 104 * s, height: 104 * s,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: Sky.gold.withValues(alpha: 0.16),
                                    ),
                                    alignment: Alignment.center,
                                    child: Container(
                                      width: 92, height: 92,
                                      decoration: const BoxDecoration(
                                          shape: BoxShape.circle, gradient: Sky.goldGrad,),
                                      padding: const EdgeInsets.all(3),
                                      child: AppAvatar(name: name, photoUrl: cust?.profilePhoto, size: 86),
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                          const SizedBox(height: 16),
                          Text(name,
                              style: Sky.h1.copyWith(color: Sky.ink, fontSize: 25),
                              maxLines: 1, overflow: TextOverflow.ellipsis,),
                          const SizedBox(height: 4),
                          Text('is requesting a consultation',
                              style: Sky.label.copyWith(color: Sky.ink2, fontSize: 13.5),),
                          if (chip.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(color: Sky.line),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.auto_awesome_rounded, size: 13, color: Sky.gold),
                                  const SizedBox(width: 6),
                                  Text(chip,
                                      style: Sky.label.copyWith(
                                          color: Sky.purpleDeep, fontSize: 12.5, fontWeight: FontWeight.w700,),),
                                ],
                              ),
                            ),
                          ],
                          const Spacer(),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                            children: [
                              _action(
                                label: 'Decline',
                                color: Sky.red,
                                icon: Icons.close_rounded,
                                onTap: _acting ? null : _decline,
                              ),
                              _action(
                                label: 'Accept',
                                color: Sky.green,
                                icon: Icons.chat_bubble_rounded,
                                onTap: _acting ? null : _accept,
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Text(_acting ? 'Connecting…' : 'Auto-declines shortly if unanswered',
                              style: Sky.label.copyWith(color: Sky.ink3, fontSize: 11.5),),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _action({
    required String label,
    required Color color,
    required IconData icon,
    required VoidCallback? onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 74,
            height: 74,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              boxShadow: [BoxShadow(color: color.withValues(alpha: 0.5), blurRadius: 18, offset: const Offset(0, 6))],
            ),
            child: Icon(icon, color: Colors.white, size: 32),
          ),
          const SizedBox(height: 10),
          Text(label, style: Sky.label.copyWith(color: Sky.ink, fontWeight: FontWeight.w700, fontSize: 13.5)),
        ],
      ),
    );
  }
}
