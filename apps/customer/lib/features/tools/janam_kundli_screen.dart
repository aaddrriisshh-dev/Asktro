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
    final yogas = r.yogas;
    final dasha = r.dashaPeriods;
    final details = <List<String>>[
      if (r.nakshatraName != null)
        ['Nakshatra', r.nakshatraLord != null ? '${r.nakshatraName} · ${r.nakshatraLord}' : r.nakshatraName!],
      if (r.chandraRasi != null) ['Moon sign (Chandra)', r.chandraRasi!],
      if (r.sooryaRasi != null) ['Sun sign (Sūrya)', r.sooryaRasi!],
      if (r.zodiac != null) ['Zodiac (Rāśi)', r.zodiac!],
    ];
    return ListView(
      padding: EdgeInsets.fromLTRB(18, 6, 18, 32 + MediaQuery.of(context).padding.bottom),
      children: [
        _nameCard(p),
        const SizedBox(height: 16),
        if (r.chartSvg != null) _chartCard(r.chartSvg!) else _chartUnavailable(),
        if (details.isNotEmpty) ...[
          const SizedBox(height: 16),
          _detailsCard(details),
        ],
        if (r.hasMangalDosha != null) ...[
          const SizedBox(height: 12),
          _mangalCard(r),
        ],
        if (yogas.isNotEmpty) ...[
          const SizedBox(height: 20),
          _sectionHeader('Yogas in your chart'),
          const SizedBox(height: 10),
          _yogasCard(yogas),
        ],
        if (dasha.isNotEmpty) ...[
          const SizedBox(height: 20),
          _sectionHeader('Planetary periods · Vimshottari Dasha'),
          const SizedBox(height: 10),
          _dashaCard(dasha),
        ],
        if (p != null && !p.birthTimeKnown) ...[
          const SizedBox(height: 14),
          _timeCaveat(),
        ],
        const SizedBox(height: 20),
        _shareButton(p, r),
      ],
    );
  }

  /// Compact identity card — name + birth details in a small horizontal strip
  /// instead of a tall centred hero.
  Widget _nameCard(UserProfile? p) {
    final date = p?.birthDate;
    final parts = <String>[];
    if (date != null) parts.add(DateFormat('d MMM yyyy').format(date));
    if (p != null && p.birthTimeKnown && p.birthTime != null) parts.add(p.birthTime!);
    if (p != null && p.birthPlace != null && p.birthPlace!.isNotEmpty) parts.add(p.birthPlace!);
    final line = parts.join('  ·  ');
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
          color: Colors.white, borderRadius: BorderRadius.circular(18), boxShadow: Ob.softShadow,),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: const BoxDecoration(gradient: Ob.goldCircle, shape: BoxShape.circle),
            child: const Icon(Icons.brightness_5_rounded, color: Colors.white, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(p?.name.isNotEmpty == true ? p!.name : 'Your Kundli',
                    style: Ob.option.copyWith(fontWeight: FontWeight.w800, fontSize: 17),),
                if (line.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(line, style: Ob.note),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Grouped birth-details card: nakshatra / moon / sun / zodiac as tidy rows
  /// (values wrap and use a smaller weight so long text stays inside the card).
  Widget _detailsCard(List<List<String>> rows) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
          color: Colors.white, borderRadius: BorderRadius.circular(18), boxShadow: Ob.softShadow,),
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++)
            Container(
              decoration: BoxDecoration(
                border: i == rows.length - 1
                    ? null
                    : const Border(bottom: BorderSide(color: Color(0xFFF1ECFB))),
              ),
              padding: const EdgeInsets.symmetric(vertical: 13),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(flex: 5, child: Text(rows[i][0], style: Ob.note)),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 6,
                    child: Text(rows[i][1],
                        textAlign: TextAlign.right,
                        style: Ob.note.copyWith(
                            fontSize: 13.5, fontWeight: FontWeight.w700, color: Ob.navy,),),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _sectionHeader(String text) => Row(
        children: [
          const Text('✦', style: TextStyle(color: Ob.gold, fontSize: 15)),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: Ob.sectionLabel.copyWith(fontSize: 16))),
        ],
      );


  Widget _chartCard(String svg) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFFFDF7), Color(0xFFFBF4E4)], // soft parchment
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Ob.selectedBorder, width: 1.4),
        boxShadow: Ob.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            const Icon(Icons.auto_awesome, size: 16, color: Ob.goldDeep),
            const SizedBox(width: 8),
            Text('Birth Chart · Rāśi',
                style: Ob.sectionLabel.copyWith(color: Ob.goldDeep),),
          ],),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFEADFBE)),
            ),
            child: AspectRatio(
              aspectRatio: 1,
              child: SvgPicture.string(
                svg,
                fit: BoxFit.contain,
                placeholderBuilder: (_) =>
                    const Center(child: CircularProgressIndicator(color: Ob.purple)),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Center(child: Text('North Indian style', style: Ob.note)),
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

  Widget _mangalCard(KundliResult r) {
    final has = r.hasMangalDosha ?? false;
    final color = has ? const Color(0xFFC9791F) : const Color(0xFF2F9C63);
    final bg = has ? const Color(0xFFFBF1E3) : const Color(0xFFE9F6EF);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(18)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(has ? Icons.warning_amber_rounded : Icons.verified_rounded, color: color, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(has ? 'Mangal Dosha present' : 'No Mangal Dosha',
                    style: Ob.option.copyWith(fontWeight: FontWeight.w700, color: color),),
                if (r.mangalDoshaDescription != null) ...[
                  const SizedBox(height: 4),
                  Text(r.mangalDoshaDescription!, style: Ob.note),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _yogasCard(List<Map<String, dynamic>> yogas) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        decoration: BoxDecoration(
            color: Colors.white, borderRadius: BorderRadius.circular(20), boxShadow: Ob.softShadow,),
        child: Column(
          children: [
            for (final y in yogas.take(12))
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(top: 2),
                      child: Text('✦', style: TextStyle(color: Ob.gold, fontSize: 13)),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${y['name']}',
                              style: Ob.option.copyWith(fontWeight: FontWeight.w700),),
                          if (y['description'] != null && '${y['description']}'.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text('${y['description']}', style: Ob.note),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      );

  Widget _dashaCard(List<Map<String, String?>> dasha) {
    final now = DateTime.now();
    int currentIdx = -1;
    for (var i = 0; i < dasha.length; i++) {
      final s = DateTime.tryParse(dasha[i]['start'] ?? '');
      final e = DateTime.tryParse(dasha[i]['end'] ?? '');
      if (s != null && e != null && now.isAfter(s) && now.isBefore(e)) {
        currentIdx = i;
        break;
      }
    }
    String range(Map<String, String?> d) {
      final s = DateTime.tryParse(d['start'] ?? '');
      final e = DateTime.tryParse(d['end'] ?? '');
      String f(DateTime? x) => x == null ? '' : DateFormat('MMM yyyy').format(x);
      return [f(s), f(e)].where((x) => x.isNotEmpty).join(' – ');
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
          color: Colors.white, borderRadius: BorderRadius.circular(20), boxShadow: Ob.softShadow,),
      child: Column(
        children: [
          for (var i = 0; i < dasha.length; i++)
            Container(
              margin: const EdgeInsets.symmetric(vertical: 5),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
              decoration: BoxDecoration(
                color: i == currentIdx ? Ob.lavenderChip : Colors.transparent,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                        color: i == currentIdx ? Ob.purple : const Color(0xFFD8CFEC),
                        shape: BoxShape.circle,),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text('${dasha[i]['name']} Mahadasha',
                        style: Ob.option.copyWith(
                            fontWeight: i == currentIdx ? FontWeight.w800 : FontWeight.w600,),),
                  ),
                  if (i == currentIdx)
                    Container(
                      margin: const EdgeInsets.only(right: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                          color: Ob.purple, borderRadius: BorderRadius.circular(20),),
                      child: const Text('Now',
                          style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700),),
                    ),
                  Text(range(dasha[i]), style: Ob.note),
                ],
              ),
            ),
        ],
      ),
    );
  }

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
