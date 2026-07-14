import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../data/messaging_service.dart';
import '../consultation/chat_consultation_screen.dart';
import '../consultation/call_consultation_screen.dart';
import '../moderation/moderation_actions.dart';

/// Voice and video calling are live. Calls are offered only for HUMAN
/// astrologers (an AI persona has no one to answer), gated further below by
/// `!a.isAI`.
const bool kCallsEnabled = true;
const bool kVideoEnabled = true;

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
        ref.read(analyticsProvider).logEvent(AnalyticsEvents.consultationStarted, params: {
          'type': type.name,
          'astrologerId': a.id,
        },);
        Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => type == ConsultationType.chat
              ? ChatConsultationScreen(consultationId: start.consultationId, astrologer: a)
              : CallConsultationScreen(consultationId: start.consultationId, astrologer: a),
        ),);
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
    final profile = ref.watch(myProfileProvider).valueOrNull;
    final isFav = profile?.favouriteAstrologers.contains(widget.astrologerId) ?? false;
    return Scaffold(
      backgroundColor: AppColors.background,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Colors.white,
        actions: [
          if (profile != null)
            IconButton(
              tooltip: isFav ? 'Remove favourite' : 'Add favourite',
              icon: Icon(isFav ? Icons.favorite : Icons.favorite_border,
                  color: isFav ? AppColors.error : Colors.white,),
              onPressed: () => ref
                  .read(userRepositoryProvider)
                  .toggleFavourite(profile.id, widget.astrologerId, !isFav),
            ),
          // Report / block this astrologer (safety — Apple/Play UGC requirement).
          ModerationMenu(
            targetId: widget.astrologerId,
            targetLabel: 'astrologer',
            iconColor: Colors.white,
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (_, __) => const ErrorStateView(),
        data: (a) => _content(a),
      ),
      bottomNavigationBar: async.maybeWhen(
        data: (a) => _StickyBar(
          consultable: a.isConsultable,
          starting: _starting,
          // Calls are only for human astrologers — an AI persona can't answer.
          showVoice: kCallsEnabled && !a.isAI,
          showVideo: kVideoEnabled && !a.isAI,
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
      padding: EdgeInsets.zero,
      children: [
        _celestialHeader(a),
        Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
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
          ),
        ),
      ],
    );
  }

  // Premium celestial header: gradient ground, gold-ringed portrait, a small
  // online dot, and an ASKTRO Verified badge under the photo.
  Widget _celestialHeader(Astrologer a) {
    final topPad = MediaQuery.of(context).padding.top + kToolbarHeight - 6;
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF8A63D2), Color(0xFF5E3FBE), Color(0xFF3A2A6E)],
        ),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(30)),
      ),
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, topPad, 20, 26),
        child: Column(
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  padding: const EdgeInsets.all(3),
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(colors: [Color(0xFFEAD079), Color(0xFFD4AF37)]),
                  ),
                  child: AppAvatar(name: a.name, photoUrl: a.profilePhoto, size: 96),
                ),
                if (a.onlineStatus)
                  Positioned(
                    right: 4,
                    bottom: 4,
                    child: Container(
                      width: 18,
                      height: 18,
                      decoration: BoxDecoration(
                        color: AppColors.online,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 3),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            // ASKTRO Verified badge
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFFF3D97C), Color(0xFFD4AF37)]),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.verified_rounded, size: 14, color: Color(0xFF3A2A6E)),
                  const SizedBox(width: 5),
                  Text('ASKTRO VERIFIED',
                      style: AppTypography.caption.copyWith(
                          color: const Color(0xFF3A2A6E), fontWeight: FontWeight.w800, fontSize: 10.5, letterSpacing: 0.5,),),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Flexible(
                  child: Text(a.name,
                      style: AppTypography.title.copyWith(color: Colors.white),
                      textAlign: TextAlign.center, overflow: TextOverflow.ellipsis,),
                ),
                if (a.isAI) ...[const SizedBox(width: 6), const AiBadge()],
              ],
            ),
            const SizedBox(height: 4),
            Text(a.expertise.join(' • '),
                style: AppTypography.caption.copyWith(color: Colors.white.withValues(alpha: 0.85)),
                textAlign: TextAlign.center,),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(999)),
              child: Text(a.rateLabel, style: AppTypography.body.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
            ),
            const SizedBox(height: 18),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _stat('${a.rating.toStringAsFixed(1)}★', 'Rating'),
                _stat('${a.experience}y', 'Experience'),
                _stat('${a.totalConsultations}', 'Sessions'),
                _stat('${a.followers}', 'Followers'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _stat(String value, String label) => Column(
        children: [
          Text(value, style: AppTypography.subtitle.copyWith(color: Colors.white)),
          Text(label, style: AppTypography.caption.copyWith(color: Colors.white.withValues(alpha: 0.75))),
        ],
      );
}

class _StickyBar extends StatelessWidget {
  const _StickyBar({
    required this.consultable,
    required this.starting,
    required this.showVoice,
    required this.showVideo,
    required this.onChat,
    required this.onVoice,
    required this.onVideo,
  });
  final bool consultable;
  final bool starting;
  final bool showVoice;
  final bool showVideo;
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
                      // Voice for human astrologers; video follows in its own
                      // phase. An AI persona shows Chat only (no one to answer).
                      if (showVoice) ...[
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(child: _btn(Icons.call_outlined, 'Voice', onVoice)),
                      ],
                      if (showVideo) ...[
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(child: _btn(Icons.videocam_outlined, 'Video', onVideo)),
                      ],
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
