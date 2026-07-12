import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/providers.dart';
import '../../data/horoscope_service.dart';
import '../profile_setup/onboarding_style.dart';
import 'zodiac.dart';

/// Daily horoscope, personalised from the birth date collected at onboarding.
/// Content comes from ProKerala (rich, per-aspect predictions), cached per sign
/// per day, with a graceful text fallback if the service is unreachable.
class HoroscopeScreen extends ConsumerStatefulWidget {
  const HoroscopeScreen({super.key});

  @override
  ConsumerState<HoroscopeScreen> createState() => _HoroscopeScreenState();
}

class _Prediction {
  const _Prediction(this.label, this.icon, this.text);
  final String label;
  final IconData icon;
  final String text;
}

class _HoroscopeScreenState extends ConsumerState<HoroscopeScreen> {
  final _service = HoroscopeService();
  late ZodiacSign _sign;
  bool _loading = true;
  List<_Prediction>? _predictions; // rich (ProKerala)
  String? _fallbackText; // plain text (free API) when ProKerala is unavailable

  @override
  void initState() {
    super.initState();
    final birth = ref.read(myProfileProvider).valueOrNull?.birthDate;
    _sign = birth != null ? ZodiacSign.fromDate(birth) : ZodiacSign.all.first;
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _predictions = null;
      _fallbackText = null;
    });

    Map<String, dynamic>? data;
    final repo = ref.read(prokeralaRepositoryProvider);
    if (repo != null) {
      try {
        data = await repo.dailyHoroscope(_sign.name);
      } catch (_) {}
    }
    if (!mounted) return;

    final preds = data != null ? _extract(data) : const <_Prediction>[];
    if (preds.isNotEmpty) {
      setState(() {
        _predictions = preds;
        _loading = false;
      });
      return;
    }

    // Fallback: the free text service (never fails — has a local reading).
    final result = await _service.daily(_sign.name);
    if (!mounted) return;
    setState(() {
      _fallbackText = result.text;
      _loading = false;
    });
  }

  /// Defensively flatten ProKerala's daily prediction into aspect cards,
  /// handling both a `predictions` list and a map-of-aspects shape.
  List<_Prediction> _extract(Map<String, dynamic> data) {
    final container = (data['daily_prediction'] is Map)
        ? Map<String, dynamic>.from(data['daily_prediction'] as Map)
        : data;
    final out = <_Prediction>[];

    void add(String key, String? text) {
      final t = text?.trim();
      if (t == null || t.isEmpty) return;
      out.add(_Prediction(_labelFor(key), _iconFor(key), t));
    }

    final preds = container['predictions'] ?? container['prediction'];
    if (preds is List) {
      for (final p in preds) {
        if (p is Map) {
          final key = '${p['type'] ?? p['name'] ?? p['id'] ?? 'general'}';
          add(key, (p['prediction'] ?? p['description'] ?? p['text'])?.toString());
        }
      }
    } else if (preds is Map) {
      preds.forEach((k, v) {
        if (v is String) {
          add('$k', v);
        } else if (v is Map) {
          add('$k', (v['prediction'] ?? v['description'] ?? v['text'])?.toString());
        }
      });
    } else if (preds is String) {
      add('general', preds);
    }
    return out;
  }

  String _labelFor(String key) {
    switch (key.toLowerCase()) {
      case 'general':
        return 'Overview';
      case 'health':
        return 'Health';
      case 'profession':
      case 'career':
        return 'Career';
      case 'emotions':
      case 'love':
      case 'relationship':
      case 'personal_life':
        return 'Love & Emotions';
      case 'travel':
        return 'Travel';
      case 'luck':
        return 'Luck';
      case 'finances':
      case 'money':
        return 'Money';
      case 'family':
        return 'Family';
      default:
        final s = key.replaceAll('_', ' ');
        return s.isEmpty ? 'Reading' : '${s[0].toUpperCase()}${s.substring(1)}';
    }
  }

  IconData _iconFor(String key) {
    switch (key.toLowerCase()) {
      case 'health':
        return Icons.favorite_rounded;
      case 'profession':
      case 'career':
        return Icons.work_rounded;
      case 'emotions':
      case 'love':
      case 'relationship':
      case 'personal_life':
        return Icons.favorite_border_rounded;
      case 'travel':
        return Icons.flight_takeoff_rounded;
      case 'luck':
        return Icons.auto_awesome_rounded;
      case 'finances':
      case 'money':
        return Icons.account_balance_wallet_rounded;
      case 'family':
        return Icons.home_rounded;
      default:
        return Icons.brightness_5_rounded;
    }
  }

  void _select(ZodiacSign s) {
    if (s.name == _sign.name) return;
    setState(() => _sign = s);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Ob.bgColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Ob.navy,
        title: Text('Daily Horoscope',
            style: GoogleFonts.cormorantGaramond(
                fontSize: 24, fontWeight: FontWeight.w700, color: Ob.navy,),),
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(18, 8, 18, 32 + MediaQuery.of(context).padding.bottom),
        children: [
          _hero(),
          const SizedBox(height: 18),
          _signStrip(),
          const SizedBox(height: 20),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: CircularProgressIndicator(color: Ob.purple)),
            )
          else if (_predictions != null && _predictions!.isNotEmpty)
            ..._richCards()
          else
            _plainCard(),
        ],
      ),
    );
  }

  Widget _hero() {
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
      child: Row(
        children: [
          Container(
            width: 74,
            height: 74,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.14),
              shape: BoxShape.circle,
              border: Border.all(color: const Color(0x55FFFFFF)),
            ),
            alignment: Alignment.center,
            child: Text(_sign.symbol, style: const TextStyle(fontSize: 38, color: Colors.white)),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('✦  TODAY',
                    style: TextStyle(
                        color: Color(0xFFF3D98A),
                        fontSize: 11,
                        letterSpacing: 2,
                        fontWeight: FontWeight.w700,),),
                const SizedBox(height: 3),
                Text(_sign.name,
                    style: GoogleFonts.cormorantGaramond(
                        color: Colors.white, fontSize: 30, fontWeight: FontWeight.w700, height: 1.05,),),
                Text(_sign.dates,
                    style: const TextStyle(color: Color(0xCCFFFFFF), fontSize: 13),),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _signStrip() {
    return SizedBox(
      height: 62,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: ZodiacSign.all.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (_, i) {
          final s = ZodiacSign.all[i];
          final sel = s.name == _sign.name;
          return GestureDetector(
            onTap: () => _select(s),
            child: Container(
              width: 56,
              decoration: BoxDecoration(
                color: sel ? Ob.selectedFill : Ob.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: sel ? Ob.selectedBorder : Ob.border, width: sel ? 1.6 : 1),
                boxShadow: sel ? null : Ob.softShadow,
              ),
              alignment: Alignment.center,
              child: Text(s.symbol,
                  style: TextStyle(fontSize: 26, color: sel ? Ob.goldDeep : Ob.purple),),
            ),
          );
        },
      ),
    );
  }

  List<Widget> _richCards() {
    final cards = <Widget>[];
    for (var i = 0; i < _predictions!.length; i++) {
      final p = _predictions![i];
      cards.add(_aspectCard(p, first: i == 0));
      if (i != _predictions!.length - 1) cards.add(const SizedBox(height: 12));
    }
    return cards;
  }

  Widget _aspectCard(_Prediction p, {bool first = false}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: first
            ? const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFFBF4E4), Color(0xFFFFFDF7)],
              )
            : const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFFBF7FF), Color(0xFFF3ECFB)],
              ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: first ? Ob.selectedBorder.withValues(alpha: 0.6) : const Color(0xFFE9E1F8)),
        boxShadow: Ob.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                    color: first ? const Color(0x22B8942A) : Ob.lavenderChip,
                    borderRadius: BorderRadius.circular(10),),
                child: Icon(p.icon, size: 18, color: first ? Ob.goldDeep : Ob.purple),
              ),
              const SizedBox(width: 10),
              Text(p.label, style: Ob.sectionLabel.copyWith(fontSize: 15.5)),
            ],
          ),
          const SizedBox(height: 10),
          Text(p.text, style: Ob.subtitle.copyWith(fontSize: 14.5, height: 1.55, color: Ob.navy)),
        ],
      ),
    );
  }

  Widget _plainCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
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
              const Icon(Icons.auto_awesome, color: Ob.gold, size: 18),
              const SizedBox(width: 8),
              Text("Today's reading", style: Ob.sectionLabel),
            ],
          ),
          const SizedBox(height: 14),
          Text(_fallbackText ?? "We couldn't reach the stars just now.",
              style: Ob.subtitle.copyWith(fontSize: 15, height: 1.6, color: Ob.navy),),
        ],
      ),
    );
  }
}
