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

  /// Backstop self-heal: `ensureProfile` already writes the onboarding details
  /// in one create at sign-in. But if the profile doc was created some other way
  /// first (e.g. the server onAuthUserCreate trigger, or an earlier partial
  /// signup) so `ensureProfile` saw it exists and skipped, the buffered
  /// onboarding could be missing. Apply it here as an idempotent update. Only
  /// clear the buffer once the write actually lands, so a failure is retried.
  Future<void> _flushPendingProfile() async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    final pending = ref.read(pendingProfileProvider) ?? await readPendingProfile();
    if (pending == null) return;
    try {
      await ref.read(userRepositoryProvider).updateProfile(uid, pending);
      ref.read(analyticsProvider).logEvent('profile_setup_complete');
      ref.read(pendingProfileProvider.notifier).state = null;
      await clearPendingProfile();
    } catch (_) {
      // Doc may not exist yet (ensureProfile create in flight) — keep the buffer
      // for a later retry; ensureProfile itself already includes these fields.
    }
  }

  @override
  Widget build(BuildContext context) => const HomeShell();
}
