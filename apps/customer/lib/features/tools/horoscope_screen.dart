import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/providers.dart';
import '../../data/horoscope_service.dart';
import '../profile_setup/onboarding_style.dart';
import 'zodiac.dart';

/// Daily horoscope, personalised from the birth date collected at onboarding.
/// The user can switch signs; text comes from a free horoscope API.
class HoroscopeScreen extends ConsumerStatefulWidget {
  const HoroscopeScreen({super.key});

  @override
  ConsumerState<HoroscopeScreen> createState() => _HoroscopeScreenState();
}

class _HoroscopeScreenState extends ConsumerState<HoroscopeScreen> {
  final _service = HoroscopeService();
  late ZodiacSign _sign;
  bool _loading = true;
  String? _text;

  @override
  void initState() {
    super.initState();
    final birth = ref.read(myProfileProvider).valueOrNull?.birthDate;
    _sign = birth != null ? ZodiacSign.fromDate(birth) : ZodiacSign.all.first;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _text = null;
    });
    final result = await _service.daily(_sign.name);
    if (!mounted) return;
    setState(() {
      _text = result.text;
      _loading = false;
    });
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
                fontSize: 24, fontWeight: FontWeight.w700, color: Ob.navy)),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          _hero(),
          const SizedBox(height: 20),
          _signStrip(),
          const SizedBox(height: 22),
          _card(),
        ],
      ),
    );
  }

  Widget _hero() {
    return Column(
      children: [
        Container(
          width: 108,
          height: 108,
          decoration: const BoxDecoration(gradient: Ob.goldCircle, shape: BoxShape.circle),
          alignment: Alignment.center,
          child: Text(_sign.symbol, style: const TextStyle(fontSize: 52, color: Colors.white)),
        ),
        const SizedBox(height: 12),
        Text(_sign.name, style: Ob.display),
        const SizedBox(height: 2),
        Text(_sign.dates, style: Ob.subtitle),
      ],
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
                  style: TextStyle(fontSize: 26, color: sel ? Ob.goldDeep : Ob.purple)),
            ),
          );
        },
      ),
    );
  }

  Widget _card() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Ob.surface,
        borderRadius: BorderRadius.circular(Ob.cardRadius),
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
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator(color: Ob.purple)),
            )
          else if (_text == null)
            Column(
              children: [
                Text(
                  "We couldn't reach the stars just now. Please check your connection and try again.",
                  style: Ob.subtitle,
                ),
                const SizedBox(height: 14),
                TextButton(
                  onPressed: _load,
                  child: Text('Retry',
                      style: Ob.option.copyWith(color: Ob.purple, fontWeight: FontWeight.w600)),
                ),
              ],
            )
          else
            Text(_text!, style: Ob.subtitle.copyWith(fontSize: 15, height: 1.6, color: Ob.navy)),
        ],
      ),
    );
  }
}
