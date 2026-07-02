import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../profile_setup/profile_setup_screen.dart';
import 'home_shell.dart';

/// Decides what a signed-in user sees at `/home`: the first-run profile setup
/// wizard while their profile is incomplete, otherwise the real home. Keying
/// off the realtime profile stream means the swap happens automatically the
/// moment onboarding finishes (no manual navigation).
class HomeGate extends ConsumerWidget {
  const HomeGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myProfileProvider);
    return async.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator(color: AppColors.primary)),
      ),
      error: (_, __) => const HomeShell(),
      data: (profile) {
        if (profile != null && !profile.onboardingComplete) {
          return ProfileSetupScreen(
            initialName: profile.name.isEmpty || profile.name == 'Guest'
                ? null
                : profile.name,
          );
        }
        return const HomeShell();
      },
    );
  }
}
