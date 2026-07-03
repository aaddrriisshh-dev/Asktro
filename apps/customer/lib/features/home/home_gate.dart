import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import 'home_shell.dart';

/// What a signed-in user sees at `/home`. Profile setup now runs BEFORE login,
/// so on first arrival here we flush the details collected during setup
/// (buffered in [pendingProfileProvider]) to Firestore against the new uid,
/// then show the real home. Returning users have nothing pending and go
/// straight to the home shell.
class HomeGate extends ConsumerStatefulWidget {
  const HomeGate({super.key});

  @override
  ConsumerState<HomeGate> createState() => _HomeGateState();
}

class _HomeGateState extends ConsumerState<HomeGate> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _flushPendingProfile());
  }

  Future<void> _flushPendingProfile() async {
    final pending = ref.read(pendingProfileProvider);
    final uid = ref.read(currentUidProvider);
    if (pending == null || uid == null) return;
    try {
      await ref.read(userRepositoryProvider).updateProfile(uid, pending);
      ref.read(analyticsProvider).logEvent('profile_setup_complete');
    } catch (_) {
      // Best effort — the user can update details later from Profile.
    }
    ref.read(pendingProfileProvider.notifier).state = null;
  }

  @override
  Widget build(BuildContext context) => const HomeShell();
}
