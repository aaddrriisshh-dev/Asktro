import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../app/router.dart';
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

  /// Backstop self-heal, and the authoritative point where the onboarding buffer
  /// is cleared. `ensureProfile` writes the details in one create at sign-in, but
  /// that can miss them — the doc pre-existed as a bare 'Guest' (server
  /// onAuthUserCreate trigger won the race), the buffer wasn't in hand, or an
  /// offline write never synced. This runs on every arrival at /home, re-applies
  /// the buffered details idempotently (reserved money/referral fields stripped so
  /// the update can't be denied), and clears the buffer ONLY after that write
  /// succeeds — so a failure is simply retried on the next /home, and the details
  /// are never dropped while unsaved.
  Future<void> _flushPendingProfile() async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    final pending = ref.read(pendingProfileProvider) ?? await readPendingProfile();
    if (pending == null) return;
    try {
      await ref.read(userRepositoryProvider).applyOnboarding(uid, pending);
      ref.read(analyticsProvider).logEvent('profile_setup_complete');
      ref.read(pendingProfileProvider.notifier).state = null;
      await clearPendingProfile();
    } catch (_) {
      // Write didn't land (offline / doc-create in flight) — keep the buffer in
      // memory AND on disk for a retry on the next /home arrival.
    }
  }

  @override
  Widget build(BuildContext context) => const HomeShell();
}
