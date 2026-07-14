import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import 'providers.dart';
import 'router.dart';
import '../features/consultation/incoming_call.dart';

class AsktroAstrologerApp extends ConsumerWidget {
  const AsktroAstrologerApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'ASKTRO for Astrologers',
      debugShowCheckedModeBanner: false,
      theme: AsktroTheme.light(),
      routerConfig: ref.watch(routerProvider),
      // Keep the incoming-call gate alive above every route, so a call rings no
      // matter which screen the astrologer is on (not just the Home tab).
      builder: (context, child) => Stack(
        children: [
          if (child != null) child,
          const _AppWideIncomingCall(),
        ],
      ),
    );
  }
}

/// Mounts the incoming-call gate whenever an astrologer is signed in. Invisible
/// — it only listens for new requests and raises the ring.
class _AppWideIncomingCall extends ConsumerWidget {
  const _AppWideIncomingCall();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final self = ref.watch(selfProvider).valueOrNull;
    if (self == null) return const SizedBox.shrink();
    return IncomingCallGate(self: self);
  }
}
