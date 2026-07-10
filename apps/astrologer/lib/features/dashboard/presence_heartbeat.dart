import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';

/// Invisible sentinel: while the astrologer is online, writes a presence
/// heartbeat every ~90s. If the app crashes / loses connection / is
/// backgrounded, the heartbeat stops and a server sweep forces them offline
/// after a few minutes — so a "ghost online" astrologer never keeps receiving
/// requests no one can accept. Mount once at the dashboard root.
class PresenceHeartbeat extends ConsumerStatefulWidget {
  const PresenceHeartbeat({required this.uid, super.key});
  final String uid;

  @override
  ConsumerState<PresenceHeartbeat> createState() => _PresenceHeartbeatState();
}

class _PresenceHeartbeatState extends ConsumerState<PresenceHeartbeat> {
  Timer? _timer;
  bool _online = false;

  void _ping() => ref.read(astrologerRepositoryProvider).heartbeat(widget.uid);

  void _sync(bool online) {
    if (online == _online) return;
    _online = online;
    _timer?.cancel();
    if (online) {
      _ping(); // beat immediately on going online
      _timer = Timer.periodic(const Duration(seconds: 90), (_) => _ping());
    } else {
      _timer = null;
    }
  }

  @override
  void initState() {
    super.initState();
    // Handle the case where the astrologer is already online at mount.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _sync(ref.read(selfProvider).valueOrNull?.onlineStatus ?? false);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(selfProvider, (_, next) => _sync(next.valueOrNull?.onlineStatus ?? false));
    return const SizedBox.shrink();
  }
}
