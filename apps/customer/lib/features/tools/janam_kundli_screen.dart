import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../data/prokerala_repository.dart';
import '../profile_setup/onboarding_style.dart';

/// Janam Kundli (Vedic birth chart). Renders the ProKerala chart SVG as the
/// hero, plus the key birth details, on the app's celestial styling. The result
/// is computed once and cached, so re-opening is instant and free.
class JanamKundliScreen extends ConsumerStatefulWidget {
  const JanamKundliScreen({super.key});

  @override
  ConsumerState<JanamKundliScreen> createState() => _JanamKundliScreenState();
}

class _JanamKundliScreenState extends ConsumerState<JanamKundliScreen> {
  bool _loading = true;
  KundliResult? _result;
  String? _error;
  bool _needsBirthPlace = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load({bool force = false}) async {
    setState(() {
      _loading = true;
      _error = null;
      _needsBirthPlace = false;
    });
    final profile = ref.read(myProfileProvider).valueOrNull;
    final repo = ref.read(prokeralaRepositoryProvider);
    if (profile == null || repo == null) {
      setState(() {
        _loading = false;
        _error = 'Please sign in to view your kundli.';
      });
      return;
    }
    if ((profile.birthPlace == null || profile.birthPlace!.trim().isEmpty) &&
        profile.birthLat == null) {
      setState(() {
        _loading = false;
        _needsBirthPlace = true;
      });
      return;
    }
    try {
      final res = await repo.janamKundli(profile, forceRefresh: force);
      if (!mounted) return;
      setState(() {
        _loading = false;
        _result = res;
        if (res == null) _error = "We couldn't generate your kundli right now.";
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = "We couldn't generate your kundli right now.";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(myProfileProvider).valueOrNull;
    return Scaffold(
      backgroundColor: Ob.bgColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Ob.navy,
        title: Text('Janam Kundli',
            style: GoogleFonts.cormorantGaramond(
                fontSize: 24, fontWeight: FontWeight.w700, color: Ob.navy,),),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Ob.purple))
          : _needsBirthPlace
              ? _prompt(
                  icon: Icons.place_outlined,
                  title: 'Add your birth place',
                  message:
                      'Your kundli needs your exact birth city. Add it in Edit Profile and reopen this page.',
                )
              : _error != null
                  ? _prompt(
                      icon: Icons.auto_awesome_outlined,
                      title: 'Just a moment',
                      message: _error!,
                      retry: true,
                    )
                  : _content(profile),
    );
  }

  Widget _content(UserProfile? p) {
    final r = _result!;
    return ListView(
      padding: EdgeInsets.fromLTRB(18, 8, 18, 32 + MediaQuery.of(context).padding.bottom),
      children: [
        _hero(p),
        const SizedBox(height: 18),
        if (r.chartSvg != null) _chartCard(r.chartSvg!) else _chartUnavailable(),
        const SizedBox(height: 18),
        _detailsCard(r),
        if (p != null && !p.birthTimeKnown) ...[
          const SizedBox(height: 14),
          _timeCaveat(),
        ],
        const SizedBox(height: 20),
        _shareButton(p, r),
      ],
    );
  }

  Widget _hero(UserProfile? p) {
    final date = p?.birthDate;
    final parts = <String>[];
    if (date != null) parts.add(DateFormat('d MMM yyyy').format(date));
    if (p != null && p.birthTimeKnown && p.birthTime != null) parts.add(p.birthTime!);
    if (p != null && p.birthPlace != null && p.birthPlace!.isNotEmpty) parts.add(p.birthPlace!);
    final line = parts.join('  ·  ');
    return Column(
      children: [
        Container(
          width: 92,
          height: 92,
          decoration: const BoxDecoration(gradient: Ob.goldCircle, shape: BoxShape.circle),
          child: const Icon(Icons.brightness_5_rounded, color: Colors.white, size: 42),
        ),
        const SizedBox(height: 12),
        Text(p?.name.isNotEmpty == true ? p!.name : 'Your Kundli',
            style: Ob.title.copyWith(fontSize: 26),),
        if (line.isNotEmpty) ...[
          const SizedBox(height: 3),
          Text(line, style: Ob.note, textAlign: TextAlign.center),
        ],
      ],
    );
  }

  Widget _chartCard(String svg) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Ob.selectedBorder, width: 1.4),
        boxShadow: Ob.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            const Icon(Icons.grid_on_rounded, size: 18, color: Ob.goldDeep),
            const SizedBox(width: 8),
            Text('Birth Chart (Rāśi)',
                style: Ob.sectionLabel.copyWith(color: Ob.goldDeep),),
          ],),
          const SizedBox(height: 12),
          AspectRatio(
            aspectRatio: 1,
            child: SvgPicture.string(
              svg,
              fit: BoxFit.contain,
              placeholderBuilder: (_) =>
                  const Center(child: CircularProgressIndicator(color: Ob.purple)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _chartUnavailable() => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
            color: Colors.white, borderRadius: BorderRadius.circular(22), boxShadow: Ob.softShadow,),
        child: Text('The chart image is temporarily unavailable — your details are shown below.',
            style: Ob.note, textAlign: TextAlign.center,),
      );

  Widget _detailsCard(KundliResult r) {
    final rows = <List<String>>[
      if (r.zodiac != null) ['Zodiac (Rāśi)', r.zodiac!],
      if (r.nakshatraName != null)
        ['Nakshatra', r.nakshatraLord != null ? '${r.nakshatraName}  ·  ${r.nakshatraLord}' : r.nakshatraName!],
      if (r.chandraRasi != null) ['Moon sign (Chandra)', r.chandraRasi!],
      if (r.sooryaRasi != null) ['Sun sign (Sūrya)', r.sooryaRasi!],
      if (r.hasMangalDosha != null)
        ['Mangal Dosha', r.hasMangalDosha! ? 'Present' : 'Not present'],
    ];
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 6),
      decoration: BoxDecoration(
          color: Colors.white, borderRadius: BorderRadius.circular(22), boxShadow: Ob.softShadow,),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Your birth details', style: Ob.sectionLabel),
          const SizedBox(height: 6),
          if (rows.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Text('Details are being prepared.', style: Ob.note),
            )
          else
            ...rows.map((e) => _detailRow(e[0], e[1])),
          if (r.mangalDoshaDescription != null && (r.hasMangalDosha ?? false)) ...[
            const SizedBox(height: 8),
            Text(r.mangalDoshaDescription!, style: Ob.note),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }

  Widget _detailRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 9),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(flex: 5, child: Text(label, style: Ob.note)),
            Expanded(
                flex: 6,
                child: Text(value,
                    textAlign: TextAlign.right,
                    style: Ob.option.copyWith(fontWeight: FontWeight.w600),),),
          ],
        ),
      );

  Widget _timeCaveat() => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: Ob.lavenderChip, borderRadius: BorderRadius.circular(14),),
        child: Row(children: [
          const Icon(Icons.info_outline_rounded, size: 18, color: Ob.purpleDeep),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Birth time not set — the chart uses midday. Add your exact time in Edit Profile for a precise kundli.',
              style: Ob.note,
            ),
          ),
        ],),
      );

  Widget _shareButton(UserProfile? p, KundliResult r) {
    return SizedBox(
      width: double.infinity,
      child: FilledButton.icon(
        style: FilledButton.styleFrom(
            backgroundColor: Ob.purple, padding: const EdgeInsets.symmetric(vertical: 14),),
        onPressed: () {
          final summary = [
            '${p?.name ?? 'My'} — Janam Kundli',
            if (r.zodiac != null) 'Zodiac: ${r.zodiac}',
            if (r.nakshatraName != null) 'Nakshatra: ${r.nakshatraName}',
            if (r.chandraRasi != null) 'Moon sign: ${r.chandraRasi}',
            '— via ASKTRO',
          ].join('\n');
          Share.share(summary, subject: 'My Janam Kundli');
        },
        icon: const Icon(Icons.share_rounded, size: 18),
        label: const Text('Share'),
      ),
    );
  }

  Widget _prompt({
    required IconData icon,
    required String title,
    required String message,
    bool retry = false,
  }) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 84,
              height: 84,
              decoration: const BoxDecoration(gradient: Ob.goldCircle, shape: BoxShape.circle),
              child: Icon(icon, color: Colors.white, size: 38),
            ),
            const SizedBox(height: 16),
            Text(title, style: Ob.title.copyWith(fontSize: 24), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(message, style: Ob.subtitle, textAlign: TextAlign.center),
            if (retry) ...[
              const SizedBox(height: 18),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: Ob.purple),
                onPressed: () => _load(force: true),
                child: const Text('Try again'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
