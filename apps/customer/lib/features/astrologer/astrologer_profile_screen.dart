import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../consultation/chat_consultation_screen.dart';
import '../consultation/call_consultation_screen.dart';

final _astrologerProvider =
    StreamProvider.autoDispose.family<Astrologer, String>((ref, id) {
  return ref.watch(astrologerRepositoryProvider).watchOne(id);
});

class AstrologerProfileScreen extends ConsumerStatefulWidget {
  const AstrologerProfileScreen({super.key, required this.astrologerId});
  final String astrologerId;

  @override
  ConsumerState<AstrologerProfileScreen> createState() => _AstrologerProfileScreenState();
}

class _AstrologerProfileScreenState extends ConsumerState<AstrologerProfileScreen> {
  bool _starting = false;

  Future<void> _startConsultation(Astrologer a, ConsultationType type) async {
    if (_starting) return;
    setState(() => _starting = true);
    final res = await ref.read(consultationServiceProvider).create(astrologerId: a.id, type: type);
    if (!mounted) return;
    setState(() => _starting = false);

    res.when(
      success: (start) {
        final route = type == ConsultationType.chat
            ? MaterialPageRoute(
                builder: (_) => ChatConsultationScreen(consultationId: start.consultationId, astrologer: a))
            : MaterialPageRoute(
                builder: (_) => CallConsultationScreen(
                  consultationId: start.consultationId,
                  astrologer: a,
                  video: type == ConsultationType.video,
                ));
        Navigator.of(context).push(route);
      },
      failure: (f) {
        if (f.code == 'INSUFFICIENT_BALANCE') {
          _promptRecharge();
        } else {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message)));
        }
      },
    );
  }

  void _promptRecharge() {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Add balance to consult'),
        content: const Text('You need a minimum wallet balance to start a consultation.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Not now')),
          PrimaryButton(
            label: 'Recharge',
            expand: false,
            onPressed: () {
              Navigator.pop(context);
              context.push('/recharge');
            },
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_astrologerProvider(widget.astrologerId));
    return Scaffold(
      appBar: AppBar(),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (_, __) => const ErrorStateView(),
        data: (a) => _content(a),
      ),
      bottomNavigationBar: async.maybeWhen(
        data: (a) => _StickyBar(
          consultable: a.isConsultable,
          starting: _starting,
          onChat: () => _startConsultation(a, ConsultationType.chat),
          onVoice: () => _startConsultation(a, ConsultationType.voice),
          onVideo: () => _startConsultation(a, ConsultationType.video),
        ),
        orElse: () => const SizedBox.shrink(),
      ),
    );
  }

  Widget _content(Astrologer a) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Center(
          child: AppAvatar(name: a.name, photoUrl: a.profilePhoto, size: 110, showPresence: true, online: a.onlineStatus),
        ),
        const SizedBox(height: AppSpacing.md),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(a.name, style: AppTypography.title),
            if (a.verified) ...[const SizedBox(width: 6), const VerifiedBadge(size: 18)],
          ],
        ),
        const SizedBox(height: 4),
        Center(child: Text(a.expertise.join(' • '), style: AppTypography.caption)),
        const SizedBox(height: AppSpacing.lg),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            _stat('${a.rating.toStringAsFixed(1)}★', 'Rating'),
            _stat('${a.experience}y', 'Experience'),
            _stat('${a.totalConsultations}', 'Sessions'),
            _stat('${a.followers}', 'Followers'),
          ],
        ),
        const SizedBox(height: AppSpacing.xl),
        if (a.about.isNotEmpty) ...[
          Text('About', style: AppTypography.subtitle),
          const SizedBox(height: AppSpacing.sm),
          Text(a.about, style: AppTypography.body.copyWith(color: AppColors.textSecondary)),
          const SizedBox(height: AppSpacing.xl),
        ],
        Text('Languages', style: AppTypography.subtitle),
        const SizedBox(height: AppSpacing.sm),
        Wrap(spacing: 6, runSpacing: 6, children: a.languages.map((l) => TagChip(l)).toList()),
        const SizedBox(height: AppSpacing.xxl),
      ],
    );
  }

  Widget _stat(String value, String label) => Column(
        children: [
          Text(value, style: AppTypography.subtitle.copyWith(color: AppColors.primary)),
          Text(label, style: AppTypography.caption),
        ],
      );
}

class _StickyBar extends StatelessWidget {
  const _StickyBar({
    required this.consultable,
    required this.starting,
    required this.onChat,
    required this.onVoice,
    required this.onVideo,
  });
  final bool consultable;
  final bool starting;
  final VoidCallback onChat;
  final VoidCallback onVoice;
  final VoidCallback onVideo;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: AppColors.card, boxShadow: AppShadows.soft),
      padding: const EdgeInsets.all(AppSpacing.md),
      child: SafeArea(
        top: false,
        child: starting
            ? const SizedBox(height: 56, child: Center(child: CircularProgressIndicator(color: AppColors.primary)))
            : !consultable
                ? const SizedBox(
                    height: 56,
                    child: Center(child: Text('Astrologer is currently unavailable')),
                  )
                : Row(
                    children: [
                      Expanded(child: _btn(Icons.chat_bubble_outline_rounded, 'Chat', onChat)),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(child: _btn(Icons.call_outlined, 'Voice', onVoice)),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(child: _btn(Icons.videocam_outlined, 'Video', onVideo)),
                    ],
                  ),
      ),
    );
  }

  Widget _btn(IconData icon, String label, VoidCallback onTap) => PrimaryButton(
        label: label,
        icon: icon,
        onPressed: onTap,
      );
}
