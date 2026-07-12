import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../app/providers.dart';
import '../../data/prokerala_repository.dart';
import '../profile_setup/onboarding_style.dart';
import '../tools/janam_kundli_screen.dart';

/// A compact, collapsible "Your Kundli" card pinned at the top of a consultation
/// chat. Collapsed by default so it doesn't eat the chat; on tap it loads the
/// customer's cached birth chart and offers a jump to the full kundli.
class ChatKundliCard extends ConsumerStatefulWidget {
  const ChatKundliCard({super.key});

  @override
  ConsumerState<ChatKundliCard> createState() => _ChatKundliCardState();
}

class _ChatKundliCardState extends ConsumerState<ChatKundliCard> {
  bool _open = false;
  Future<KundliResult?>? _future;

  void _ensureStarted() {
    if (_future != null) return;
    final profile = ref.read(myProfileProvider).valueOrNull;
    final repo = ref.read(prokeralaRepositoryProvider);
    if (profile != null && repo != null) _future = repo.janamKundli(profile);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFF3ECFB), Color(0xFFFBF6FF)],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Ob.selectedBorder.withValues(alpha: 0.5)),
        boxShadow: Ob.softShadow,
      ),
      child: Column(
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () {
              setState(() => _open = !_open);
              if (_open) _ensureStarted();
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
              child: Row(
                children: [
                  const Icon(Icons.brightness_5_rounded, size: 18, color: Ob.goldDeep),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text('Your Janam Kundli',
                        style: Ob.option.copyWith(fontWeight: FontWeight.w700, fontSize: 14),),
                  ),
                  Text(_open ? 'Hide' : 'View', style: Ob.note.copyWith(color: Ob.purple)),
                  AnimatedRotation(
                    turns: _open ? 0.5 : 0,
                    duration: const Duration(milliseconds: 180),
                    child: const Icon(Icons.keyboard_arrow_down_rounded, color: Ob.purple, size: 20),
                  ),
                ],
              ),
            ),
          ),
          if (_open)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: _body(),
            ),
        ],
      ),
    );
  }

  Widget _body() {
    return FutureBuilder<KundliResult?>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(child: CircularProgressIndicator(color: Ob.purple, strokeWidth: 2.4)),
          );
        }
        final svg = snap.data?.chartSvg;
        return Column(
          children: [
            if (svg != null && svg.isNotEmpty)
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFFFCF6E7),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFEADFBE)),
                ),
                child: AspectRatio(
                  aspectRatio: 1,
                  child: SvgPicture.string(svg, fit: BoxFit.contain),
                ),
              )
            else
              Text('Add your birth place in Edit Profile to see your chart.',
                  textAlign: TextAlign.center, style: Ob.note,),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: Ob.purpleDeep,
                  side: const BorderSide(color: Ob.selectedBorder),
                  padding: const EdgeInsets.symmetric(vertical: 11),
                ),
                onPressed: () => Navigator.of(context)
                    .push(MaterialPageRoute(builder: (_) => const JanamKundliScreen())),
                icon: const Icon(Icons.open_in_full_rounded, size: 16),
                label: const Text('Open full kundli'),
              ),
            ),
          ],
        );
      },
    );
  }
}
