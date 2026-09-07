import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';

/// Invisible sentinel: while the customer app is in the FOREGROUND, writes a
/// presence heartbeat to `presence/{uid}.lastSeen` every ~90s. The admin portal
/// reads this to show who is truly "live" right now. When the app is
/// backgrounded or closed the heartbeat stops, so the customer drops off "live"
/// within a few minutes instead of lingering. Mirrors the astrologer app's
/// PresenceHeartbeat. Mount once at the home shell root.
///
/// Security rules allow a signed-in user to write ONLY a `lastSeen` field to
/// their own presence doc — so this writes exactly that, nothing else.
class PresenceHeartbeat extends ConsumerStatefulWidget {
  const PresenceHeartbeat({super.key});

  @override
  ConsumerState<PresenceHeartbeat> createState() => _PresenceHeartbeatState();
}

class _PresenceHeartbeatState extends ConsumerState<PresenceHeartbeat>
    with WidgetsBindingObserver {
  Timer? _timer;

  void _ping() {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    ref
        .read(firestoreProvider)
        .collection('presence')
        .doc(uid)
        .set({'lastSeen': FieldValue.serverTimestamp()}, SetOptions(merge: true))
        // Best-effort only — presence must never surface an error to the user.
        .catchError((_) {});
  }

  void _start() {
    _timer?.cancel();
    _ping(); // beat immediately on (re)entering the foreground
    _timer = Timer.periodic(const Duration(seconds: 90), (_) => _ping());
  }

  void _stop() {
    _timer?.cancel();
    _timer = null;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _start();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _start();
    } else {
      _stop(); // paused / inactive / detached → stop beating, drop off "live"
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
