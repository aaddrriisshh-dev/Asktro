import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../ui/celestial.dart';

/// Shown when the astrologer account is not yet approved.
class PendingReviewScreen extends ConsumerWidget {
  const PendingReviewScreen({super.key, required this.status});
  final AstrologerStatus? status;

  ({String title, String body, IconData icon, Color color}) get _view => switch (status) {
        AstrologerStatus.suspended => (
            title: 'Account suspended',
            body: 'Your account has been suspended. Please contact the Asktro team.',
            icon: Icons.pause_circle_outline_rounded,
            color: Sky.amber,
          ),
        AstrologerStatus.rejected => (
            title: 'Not approved',
            body: 'Your application was not approved at this time.',
            icon: Icons.info_outline_rounded,
            color: Sky.red,
          ),
        AstrologerStatus.disabled => (
            title: 'Account disabled',
            body: 'Your account is currently disabled.',
            icon: Icons.block_rounded,
            color: Sky.red,
          ),
        _ => (
            title: 'Under review',
            body: "Your account is being verified. We'll notify you the moment you're approved to start consulting.",
            icon: Icons.verified_user_rounded,
            color: Sky.purple,
          ),
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final v = _view;
    return SkyScaffold(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 116,
                height: 116,
                decoration: const BoxDecoration(gradient: Sky.lavGrad, shape: BoxShape.circle, boxShadow: Sky.soft),
                child: Icon(v.icon, size: 52, color: v.color),
              ),
              const SizedBox(height: 24),
              Text(v.title, style: Sky.h1, textAlign: TextAlign.center),
              const SizedBox(height: 8),
              Text(v.body, style: Sky.body.copyWith(fontSize: 14, color: Sky.ink2), textAlign: TextAlign.center),
              const SizedBox(height: 20),
              const Pill('✦ Asktro Consultation', color: Sky.gold),
              const SizedBox(height: 36),
              SizedBox(
                width: 200,
                child: GhostButton(
                  label: 'Log out',
                  icon: Icons.logout_rounded,
                  color: Sky.ink2,
                  onPressed: () => ref.read(firebaseAuthProvider).signOut(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
