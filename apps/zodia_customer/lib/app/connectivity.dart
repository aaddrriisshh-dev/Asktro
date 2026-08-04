import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

/// Emits whether the device currently has any network connectivity.
final connectivityProvider = StreamProvider<bool>((ref) {
  return Connectivity().onConnectivityChanged.map(
        (results) => results.any((r) => r != ConnectivityResult.none),
      );
});

/// Wraps the app so a friendly banner slides in when the network drops
/// ("No Internet Connection. Trying to reconnect...", Part 3 offline mode).
class ConnectivityBanner extends ConsumerWidget {
  const ConnectivityBanner({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Default to online until the first event arrives.
    final online = ref.watch(connectivityProvider).valueOrNull ?? true;
    return Directionality(
      textDirection: TextDirection.ltr,
      child: Stack(
        children: [
          child,
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: AnimatedSlide(
              duration: const Duration(milliseconds: 250),
              offset: online ? const Offset(0, 1) : Offset.zero,
              child: Material(
                color: Colors.transparent,
                child: Container(
                  color: AppColors.textDark,
                  padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
                  child: SafeArea(
                    top: false,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.wifi_off_rounded, color: Colors.white, size: 18),
                        const SizedBox(width: 8),
                        // Flexible so the message never overflows the row (the
                        // stray "12 PIXELS" strip that showed on every screen,
                        // since this banner is laid out app-wide even when online).
                        Flexible(
                          child: Text('No Internet Connection. Trying to reconnect…',
                              style: AppTypography.caption.copyWith(color: Colors.white),),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
