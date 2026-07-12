import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../app/providers.dart';
import '../profile_setup/onboarding_style.dart';

/// Today's auspicious & inauspicious windows — abhijit muhurat, rahu kaal,
/// gulika kaal, yamaganda — from ProKerala for the user's location.
class AuspiciousTimingsScreen extends ConsumerStatefulWidget {
  const AuspiciousTimingsScreen({super.key});

  @override
  ConsumerState<AuspiciousTimingsScreen> createState() => _AuspiciousTimingsScreenState();
}

class _Window {
  const _Window(this.name, this.description, this.start, this.end, this.auspicious);
  final String name;
  final String? description;
  final String? start;
  final String? end;
  final bool auspicious;
}

class _AuspiciousTimingsScreenState extends ConsumerState<AuspiciousTimingsScreen> {
  bool _loading = true;
  List<_Window>? _windows;

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
        data = await repo.auspiciousPeriod(profile);
      } catch (_) {}
    }
    if (!mounted) return;
    setState(() {
      _windows = data == null ? null : _parse(data);
      _loading = false;
    });
  }

  String? _fmt(dynamic v) {
    if (v is String && v.isNotEmpty) {
      final dt = DateTime.tryParse(v);
      if (dt != null) return DateFormat('h:mm a').format(dt.toLocal());
      return v;
    }
    return null;
  }

  bool _isAuspicious(Map<String, dynamic> m) {
    final type = '${m['type'] ?? m['nature'] ?? ''}'.toLowerCase();
    final name = '${m['name'] ?? ''}'.toLowerCase();
    if (type.contains('inauspicious') || type.contains('bad')) return false;
    if (type.contains('auspicious') || type.contains('good')) return true;
    // Fall back to the well-known inauspicious names.
    const bad = ['rahu', 'gulika', 'yamaganda', 'varjyam', 'dur muhurat', 'dur muhurtam'];
    return !bad.any(name.contains);
  }

  /// ProKerala returns a `muhurat` list; each entry may carry a `period` list of
  /// {start,end} windows. Flatten to a simple list.
  List<_Window> _parse(Map<String, dynamic> data) {
    final out = <_Window>[];
    final list = data['muhurat'] ?? data['muhurta'] ?? data['auspicious_period'] ?? data['period'];
    if (list is List) {
      for (final e in list) {
        if (e is! Map) continue;
        final m = Map<String, dynamic>.from(e);
        final name = m['name']?.toString() ?? 'Period';
        final desc = m['description']?.toString();
        final auspicious = _isAuspicious(m);
        final periods = m['period'];
        if (periods is List && periods.isNotEmpty) {
          for (final p in periods) {
            if (p is Map) {
              out.add(_Window(name, desc, _fmt(p['start']), _fmt(p['end']), auspicious));
            }
          }
        } else {
          out.add(_Window(name, desc, _fmt(m['start']), _fmt(m['end']), auspicious));
        }
      }
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final good = _windows?.where((w) => w.auspicious).toList() ?? const <_Window>[];
    final bad = _windows?.where((w) => !w.auspicious).toList() ?? const <_Window>[];
    return Scaffold(
      backgroundColor: Ob.bgColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Ob.navy,
        title: Text('Auspicious Timings',
            style: GoogleFonts.cormorantGaramond(fontSize: 24, fontWeight: FontWeight.w700, color: Ob.navy),),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Ob.purple))
          : ListView(
              padding: EdgeInsets.fromLTRB(18, 8, 18, 32 + MediaQuery.of(context).padding.bottom),
              children: [
                _hero(),
                const SizedBox(height: 18),
                if (_windows == null || _windows!.isEmpty)
                  _errorCard()
                else ...[
                  if (good.isNotEmpty) ...[
                    _sectionTitle('Auspicious', const Color(0xFF2F9C63)),
                    const SizedBox(height: 10),
                    for (final w in good) _windowCard(w),
                    const SizedBox(height: 8),
                  ],
                  if (bad.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    _sectionTitle('Avoid these windows', const Color(0xFFC0392B)),
                    const SizedBox(height: 10),
                    for (final w in bad) _windowCard(w),
                  ],
                ],
              ],
            ),
    );
  }

  Widget _hero() => Container(
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
            const Text('✦  MUHURAT',
                style: TextStyle(color: Color(0xFFF3D98A), fontSize: 11, letterSpacing: 2, fontWeight: FontWeight.w700),),
            const SizedBox(height: 4),
            Text('Auspicious timings',
                style: GoogleFonts.cormorantGaramond(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w700, height: 1.05),),
            const SizedBox(height: 2),
            Text(DateFormat('EEEE, d MMMM').format(DateTime.now()),
                style: const TextStyle(color: Color(0xCCFFFFFF), fontSize: 13),),
          ],
        ),
      );

  Widget _sectionTitle(String t, Color color) => Row(
        children: [
          Container(width: 4, height: 18, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
          const SizedBox(width: 9),
          Text(t, style: Ob.sectionLabel.copyWith(fontSize: 15.5, color: Ob.navy)),
        ],
      );

  Widget _windowCard(_Window w) {
    final color = w.auspicious ? const Color(0xFF2F9C63) : const Color(0xFFC0392B);
    final window = (w.start != null || w.end != null)
        ? '${w.start ?? ''}${w.end != null ? '  →  ${w.end}' : ''}'.trim()
        : 'Timing unavailable';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Ob.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.28)),
        boxShadow: Ob.softShadow,
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: color.withValues(alpha: 0.13), borderRadius: BorderRadius.circular(12)),
            child: Icon(w.auspicious ? Icons.check_circle_rounded : Icons.warning_amber_rounded, size: 21, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(w.name, style: Ob.option.copyWith(fontWeight: FontWeight.w700, color: Ob.navy, fontSize: 14.5)),
                const SizedBox(height: 2),
                Text(window, style: Ob.note.copyWith(fontSize: 12.5, fontWeight: FontWeight.w600, color: color)),
                if (w.description != null && w.description!.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(w.description!, style: Ob.note.copyWith(fontSize: 11.5, color: Ob.grey, height: 1.3)),
                ],
              ],
            ),
          ),
        ],
      ),
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
            Text("Couldn't load today's timings",
                style: Ob.option.copyWith(fontWeight: FontWeight.w700, color: Ob.navy),),
            const SizedBox(height: 4),
            Text('Please check your connection and try again.', textAlign: TextAlign.center, style: Ob.note),
          ],
        ),
      );
}
