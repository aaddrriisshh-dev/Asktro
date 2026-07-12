import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../app/providers.dart';
import '../profile_setup/onboarding_style.dart';

/// Today's Panchang — the Vedic almanac: vaara (weekday), tithi, nakshatra,
/// yoga, karana, plus sunrise/sunset/moonrise/moonset. Pulled from ProKerala
/// for the user's location (falls back to New Delhi) and cached per day.
class PanchangScreen extends ConsumerStatefulWidget {
  const PanchangScreen({super.key});

  @override
  ConsumerState<PanchangScreen> createState() => _PanchangScreenState();
}

class _PanchangScreenState extends ConsumerState<PanchangScreen> {
  bool _loading = true;
  Map<String, dynamic>? _data;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final profile = ref.read(myProfileProvider).valueOrNull;
    final repo = ref.read(prokeralaRepositoryProvider);
    Map<String, dynamic>? data;
    if (profile != null && repo != null) {
      try {
        data = await repo.panchang(profile);
      } catch (_) {}
    }
    if (!mounted) return;
    setState(() {
      _data = data;
      _loading = false;
    });
  }

  String? _time(dynamic v) {
    if (v is String && v.isNotEmpty) {
      final dt = DateTime.tryParse(v);
      if (dt != null) return DateFormat('h:mm a').format(dt.toLocal());
      return v;
    }
    return null;
  }

  /// A panchang element (tithi/nakshatra/yoga/karana) as a list of segments,
  /// each {name, start, end}. Handles both a bare map and a list.
  List<Map<String, dynamic>> _segments(String key) {
    final v = _data?[key];
    if (v is List) return v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    if (v is Map) return [Map<String, dynamic>.from(v)];
    return const [];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Ob.bgColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Ob.navy,
        title: Text('Panchang',
            style: GoogleFonts.cormorantGaramond(fontSize: 24, fontWeight: FontWeight.w700, color: Ob.navy),),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Ob.purple))
          : ListView(
              padding: EdgeInsets.fromLTRB(18, 8, 18, 32 + MediaQuery.of(context).padding.bottom),
              children: [
                _hero(),
                const SizedBox(height: 18),
                if (_data == null)
                  _errorCard()
                else ...[
                  _sunMoonCard(),
                  const SizedBox(height: 16),
                  _elementCard('Tithi', Icons.brightness_2_rounded, _segments('tithi')),
                  _elementCard('Nakshatra', Icons.auto_awesome_rounded, _segments('nakshatra')),
                  _elementCard('Yoga', Icons.self_improvement_rounded, _segments('yoga')),
                  _elementCard('Karana', Icons.change_history_rounded, _segments('karana')),
                ],
              ],
            ),
    );
  }

  Widget _hero() {
    final vaara = _data?['vaara']?.toString() ?? DateFormat('EEEE').format(DateTime.now());
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF322E63), Color(0xFF5E3FBE)],
        ),
        borderRadius: BorderRadius.circular(22),
        boxShadow: Ob.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('✦  TODAY’S ALMANAC',
              style: TextStyle(color: Color(0xFFF3D98A), fontSize: 11, letterSpacing: 2, fontWeight: FontWeight.w700),),
          const SizedBox(height: 4),
          Text(DateFormat('EEEE, d MMMM yyyy').format(DateTime.now()),
              style: GoogleFonts.cormorantGaramond(color: Colors.white, fontSize: 25, fontWeight: FontWeight.w700, height: 1.1),),
          const SizedBox(height: 2),
          Text('Vaara · $vaara', style: const TextStyle(color: Color(0xCCFFFFFF), fontSize: 13)),
        ],
      ),
    );
  }

  Widget _sunMoonCard() {
    final tiles = [
      (Icons.wb_twilight_rounded, 'Sunrise', _time(_data?['sunrise']), const Color(0xFFE0A100)),
      (Icons.nights_stay_rounded, 'Sunset', _time(_data?['sunset']), const Color(0xFFC77E28)),
      (Icons.bedtime_rounded, 'Moonrise', _time(_data?['moonrise']), const Color(0xFF3A7CA5)),
      (Icons.dark_mode_rounded, 'Moonset', _time(_data?['moonset']), const Color(0xFF6B5BA6)),
    ].where((t) => t.$3 != null).toList();
    if (tiles.isEmpty) return const SizedBox.shrink();
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 2.7,
      children: [
        for (final t in tiles)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: Ob.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Ob.border),
              boxShadow: Ob.softShadow,
            ),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(color: t.$4.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(11)),
                  child: Icon(t.$1, size: 19, color: t.$4),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(t.$2.toUpperCase(),
                          style: Ob.note.copyWith(fontSize: 9, letterSpacing: 0.5, color: Ob.grey),),
                      Text(t.$3!, style: Ob.note.copyWith(fontSize: 13.5, fontWeight: FontWeight.w800, color: Ob.navy)),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _elementCard(String title, IconData icon, List<Map<String, dynamic>> segments) {
    if (segments.isEmpty) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFBF7FF), Color(0xFFF3ECFB)],
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE9E1F8)),
        boxShadow: Ob.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(color: Ob.lavenderChip, borderRadius: BorderRadius.circular(10)),
                child: Icon(icon, size: 18, color: Ob.purple),
              ),
              const SizedBox(width: 10),
              Text(title, style: Ob.sectionLabel.copyWith(fontSize: 15.5)),
            ],
          ),
          const SizedBox(height: 12),
          for (var i = 0; i < segments.length; i++) ...[
            _segmentRow(segments[i]),
            if (i != segments.length - 1)
              const Divider(height: 18, color: Color(0xFFE2D8F4)),
          ],
        ],
      ),
    );
  }

  Widget _segmentRow(Map<String, dynamic> seg) {
    final name = seg['name']?.toString() ?? '—';
    final lord = (seg['lord'] is Map ? (seg['lord']['name']) : seg['lord'])?.toString();
    final start = _time(seg['start']);
    final end = _time(seg['end']);
    final window = (start != null || end != null) ? '${start ?? ''}${end != null ? ' → $end' : ''}'.trim() : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(name, style: Ob.option.copyWith(fontWeight: FontWeight.w700, color: Ob.navy)),
            ),
            if (lord != null && lord.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.7), borderRadius: BorderRadius.circular(999)),
                child: Text(lord, style: Ob.note.copyWith(fontSize: 11, fontWeight: FontWeight.w700, color: Ob.purpleDeep)),
              ),
          ],
        ),
        if (window != null) ...[
          const SizedBox(height: 3),
          Text(window, style: Ob.note.copyWith(fontSize: 12, color: Ob.grey)),
        ],
      ],
    );
  }

  Widget _errorCard() => Container(
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: Ob.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Ob.border),
        ),
        child: Column(
          children: [
            const Icon(Icons.cloud_off_rounded, color: Ob.grey, size: 30),
            const SizedBox(height: 10),
            Text("Couldn't load today's panchang",
                style: Ob.option.copyWith(fontWeight: FontWeight.w700, color: Ob.navy),),
            const SizedBox(height: 4),
            Text('Please check your connection and try again.',
                textAlign: TextAlign.center, style: Ob.note,),
          ],
        ),
      );
}
