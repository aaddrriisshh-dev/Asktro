import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';

/// One-time-per-launch prompt asking the astrologer to exempt Asktro from
/// battery optimization, so incoming call/chat pushes reliably wake a locked
/// phone. Many Android OEMs silently block background pushes to "optimized"
/// apps — which makes an astrologer miss consultations without realising it
/// (exactly the locked-phone "no ring" seen in testing). Invisible sentinel:
/// shows a dialog only when the exemption isn't granted, and re-asks on the
/// next cold start until it is. Mount once at the dashboard root.
class BatteryOptimizationPrompt extends ConsumerStatefulWidget {
  const BatteryOptimizationPrompt({super.key});

  @override
  ConsumerState<BatteryOptimizationPrompt> createState() => _BatteryOptimizationPromptState();
}

// Ask at most once per app launch (avoids nagging within a session, but still
// re-prompts on the next launch until the astrologer enables it).
bool _askedThisSession = false;

class _BatteryOptimizationPromptState extends ConsumerState<BatteryOptimizationPrompt> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybePrompt());
  }

  Future<void> _maybePrompt() async {
    if (_askedThisSession || !mounted) return;
    if (!Platform.isAndroid) return; // Android-only optimisation
    final status = await Permission.ignoreBatteryOptimizations.status;
    if (status.isGranted || !mounted) return;
    _askedThisSession = true;
    final enable = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Stay reachable for consultations'),
        content: const Text(
          'Allow Asktro to keep running in the background so call and chat '
          'requests reach you reliably, even when your phone is locked.\n\n'
          'It’s a quick one-time setting, and you can change it anytime.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Not now'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Allow'),
          ),
        ],
      ),
    );
    if (enable == true) {
      // Shows the system "allow to ignore battery optimisation?" dialog.
      await Permission.ignoreBatteryOptimizations.request();
    }
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
