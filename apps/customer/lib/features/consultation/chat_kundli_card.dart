import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../app/providers.dart';
import '../../data/prokerala_repository.dart';
import '../profile_setup/onboarding_style.dart';
import '../tools/janam_kundli_screen.dart';

/// "Your Kundli" card pinned at the top of a consultation chat. It loads the
/// customer's birth chart eagerly and shows the rendered chart image straight
/// away — so the very first thing in the chat is their kundli — with a compact
/// collapse control and a jump to the full reading.
class ChatKundliCard extends ConsumerStatefulWidget {
  const ChatKundliCard({super.key});

  @override
  ConsumerState<ChatKundliCard> createState() => _ChatKundliCardState();
}

class _ChatKundliCardState extends ConsumerState<ChatKundliCard> {
  bool _open = true; // chart shown by default
  Future<KundliResult?>? _future;

  @override
  void initState() {
    super.initState();
    // Start fetching immediately so the chart is on screen the moment the
    // chat opens, not behind a tap.
    WidgetsBinding.instance.addPostFrameCallback((_) => _ensureStarted());
  }

  void _ensureStarted() {
    if (_future != null || !mounted) return;
    final profile = ref.read(myProfileProvider).valueOrNull;
    final repo = ref.read(prokeralaRepositoryProvider);
    if (profile != null && repo != null) {
      setState(() => _future = repo.janamKundli(profile));
    }
  }

  @override
  Widget build(BuildContext context) {
    // Start the chart fetch the moment the profile resolves — the first-frame
    // read in initState often runs before the profile has loaded, which used to
    // leave the spinner running until the user toggled Hide/View by hand.
    if (_future == null && ref.watch(myProfileProvider).valueOrNull != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _ensureStarted());
    }
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
          AnimatedCrossFade(
            firstChild: const SizedBox(width: double.infinity),
            secondChild: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: _body(),
            ),
            crossFadeState: _open ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 200),
          ),
        ],
      ),
    );
  }

  Widget _body() {
    return FutureBuilder<KundliResult?>(
      future: _future,
      builder: (context, snap) {
        if (_future == null || snap.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(child: CircularProgressIndicator(color: Ob.purple, strokeWidth: 2.4)),
          );
        }
        final result = snap.data;
        final svg = result?.chartSvg;
        return Column(
          children: [
            if (svg != null && svg.isNotEmpty) ...[
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFFFCF6E7), Color(0xFFF7EFD8)],
                  ),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFEADFBE)),
                ),
                child: AspectRatio(
                  aspectRatio: 1,
                  child: SvgPicture.string(svg, fit: BoxFit.contain),
                ),
              ),
              if (result?.nakshatraName != null || result?.chandraRasi != null) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    if (result?.chandraRasi != null)
                      Expanded(child: _chip(Icons.nightlight_round, 'Moon', result!.chandraRasi!)),
                    if (result?.chandraRasi != null && result?.nakshatraName != null)
                      const SizedBox(width: 8),
                    if (result?.nakshatraName != null)
                      Expanded(child: _chip(Icons.auto_awesome_rounded, 'Nakshatra', result!.nakshatraName!)),
                  ],
                ),
              ],
            ] else
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text('Add your birth place in Edit Profile to see your chart.',
                    textAlign: TextAlign.center, style: Ob.note,),
              ),
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

  Widget _chip(IconData icon, String label, String value) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.7),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFE9E1F8)),
        ),
        child: Row(
          children: [
            Icon(icon, size: 15, color: Ob.purple),
            const SizedBox(width: 7),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label.toUpperCase(),
                      style: Ob.note.copyWith(fontSize: 8.5, letterSpacing: 0.6, color: Ob.grey),),
                  Text(value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Ob.note.copyWith(fontSize: 12.5, fontWeight: FontWeight.w700, color: Ob.navy),),
                ],
              ),
            ),
          ],
        ),
      );
}
