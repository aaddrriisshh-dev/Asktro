import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/providers.dart';
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
  late ZodiacSign _sign;
  bool _loading = true;
  List<_Prediction>? _predictions; // rich (ProKerala) — the only reading source

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
    });

    // Predictions come ONLY from ProKerala. We deliberately do NOT substitute a
    // third-party API or app-generated text — a user must never be shown a
    // "reading" that didn't come from the astrology engine. If it can't load,
    // we say so honestly.
    Map<String, dynamic>? data;
    final repo = ref.read(prokeralaRepositoryProvider);
    if (repo != null) {
      try {
        data = await repo.dailyHoroscope(_sign.name);
      } catch (_) {}
    }
    if (!mounted) return;

    final preds = data != null ? _extract(data) : const <_Prediction>[];
    setState(() {
      _predictions = preds;
      _loading = false;
    });
  }

  /// Defensively flatten ProKerala's daily prediction into aspect cards.
  /// The advanced endpoint nests readings under `daily_predictions` (an array,
  /// one entry per sign) → `predictions[]`; older/basic shapes used a
  /// `daily_prediction` map. Handle both, plus a bare top level.
  List<_Prediction> _extract(Map<String, dynamic> data) {
    Map<String, dynamic> container;
    final dp = data['daily_predictions'] ?? data['daily_prediction'];
    if (dp is List && dp.isNotEmpty && dp.first is Map) {
      container = Map<String, dynamic>.from(dp.first as Map);
    } else if (dp is Map) {
      container = Map<String, dynamic>.from(dp);
    } else {
      container = data;
    }
    final out = <_Prediction>[];

    void add(String key, String? text) {
      final t = _clean(text);
      if (t.isEmpty) return;
      out.add(_Prediction(_labelFor(key), _iconFor(key), t));
    }

    final preds = container['predictions'] ?? container['prediction'];
    if (preds is List) {
      for (final p in preds) {
        if (p is! Map) continue;
        final key = '${p['type'] ?? p['name'] ?? p['id'] ?? 'general'}';
        // Lead with the main prediction, then append ProKerala's insight,
        // seek and challenge lines so the reading is complete.
        final parts = <Object?>[
          p['prediction'] ?? p['description'] ?? p['text'],
          p['insight'], p['seek'], p['challenge'],
        ].map(_clean).where((s) => s.isNotEmpty).toList();
        add(key, parts.join('\n\n'));
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

  /// Trim + decode the handful of HTML entities ProKerala emits (e.g. `&#039;`).
  String _clean(Object? v) {
    final s = v?.toString().trim() ?? '';
    if (s.isEmpty) return s;
    return s
        .replaceAll('&#039;', '\'')
        .replaceAll('&#39;', '\'')
        .replaceAll('&quot;', '"')
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&nbsp;', ' ');
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
          _cosmicSnapshot(),
          const SizedBox(height: 14),
          _luckyGrid(),
          const SizedBox(height: 22),
          _readingHeader(),
          const SizedBox(height: 12),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: CircularProgressIndicator(color: Ob.purple)),
            )
          else if (_predictions != null && _predictions!.isNotEmpty)
            ..._richCards()
          else
            _unavailableCard(),
          const SizedBox(height: 18),
          _affirmationCard(),
        ],
      ),
    );
  }

  Widget _readingHeader() => Row(
        children: [
          Container(width: 4, height: 20, decoration: BoxDecoration(color: Ob.gold, borderRadius: BorderRadius.circular(2))),
          const SizedBox(width: 10),
          Text('Your reading today',
              style: GoogleFonts.cormorantGaramond(fontSize: 22, fontWeight: FontWeight.w700, color: Ob.navy),),
        ],
      );

  // A grid of the sign's fixed correspondences — always on screen, so the page
  // reads full and informative even while the live predictions load.
  Widget _cosmicSnapshot() {
    final t = _sign.traits;
    return Container(
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
              const Icon(Icons.public_rounded, size: 17, color: Ob.purple),
              const SizedBox(width: 8),
              Text('Cosmic snapshot', style: Ob.sectionLabel.copyWith(fontSize: 15)),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: _snapItem(Icons.local_fire_department_rounded, 'Element', t.element)),
              _snapDivider(),
              Expanded(child: _snapItem(Icons.brightness_7_rounded, 'Ruler', t.rulingPlanet)),
              _snapDivider(),
              Expanded(child: _snapItem(Icons.category_rounded, 'Quality', t.quality)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _snapDivider() => Container(width: 1, height: 34, color: const Color(0xFFE2D8F4));

  Widget _snapItem(IconData icon, String label, String value) => Column(
        children: [
          Icon(icon, size: 20, color: Ob.goldDeep),
          const SizedBox(height: 6),
          Text(label.toUpperCase(),
              style: Ob.note.copyWith(fontSize: 9.5, letterSpacing: 0.8, color: Ob.grey),),
          const SizedBox(height: 2),
          Text(value,
              textAlign: TextAlign.center,
              style: Ob.note.copyWith(fontSize: 13.5, fontWeight: FontWeight.w700, color: Ob.navy),),
        ],
      );

  Widget _luckyGrid() {
    final t = _sign.traits;
    final items = [
      (Icons.palette_rounded, 'Lucky Colour', t.luckyColor, Color(t.luckyColorHex)),
      (Icons.tag_rounded, 'Lucky Number', t.luckyNumber, Ob.purple),
      (Icons.event_rounded, 'Lucky Day', t.luckyDay, Ob.goldDeep),
      (Icons.diamond_rounded, 'Gemstone', t.gemstone, const Color(0xFF3A7CA5)),
    ];
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 2.7,
      children: [for (final it in items) _luckyTile(it.$1, it.$2, it.$3, it.$4)],
    );
  }

  Widget _luckyTile(IconData icon, String label, String value, Color accent) => Container(
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
              decoration: BoxDecoration(color: accent.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(11)),
              child: Icon(icon, size: 19, color: accent),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(label.toUpperCase(),
                      style: Ob.note.copyWith(fontSize: 9, letterSpacing: 0.5, color: Ob.grey),),
                  const SizedBox(height: 1),
                  Text(value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Ob.note.copyWith(fontSize: 14, fontWeight: FontWeight.w800, color: Ob.navy),),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _affirmationCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF322E63), Color(0xFF5E3FBE)],
        ),
        borderRadius: BorderRadius.circular(18),
        boxShadow: Ob.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.format_quote_rounded, color: Color(0xFFF3D98A), size: 20),
              SizedBox(width: 8),
              Text('YOUR AFFIRMATION',
                  style: TextStyle(color: Color(0xFFF3D98A), fontSize: 11, letterSpacing: 1.5, fontWeight: FontWeight.w700),),
            ],
          ),
          const SizedBox(height: 10),
          Text(_affirmationFor(_sign.name),
              style: GoogleFonts.cormorantGaramond(
                  color: Colors.white, fontSize: 20, fontWeight: FontWeight.w600, height: 1.35, fontStyle: FontStyle.italic,),),
        ],
      ),
    );
  }

  String _affirmationFor(String sign) {
    const map = {
      'Aries': 'I lead with courage and let my energy open new doors.',
      'Taurus': 'I am grounded, patient, and worthy of comfort and abundance.',
      'Gemini': 'My curiosity is a gift; I speak my truth with ease.',
      'Cancer': 'I honour my feelings and create safety wherever I go.',
      'Leo': 'I shine authentically and my warmth uplifts everyone around me.',
      'Virgo': 'I trust the process and find peace in doing my best.',
      'Libra': 'I choose balance, and harmony flows to me effortlessly.',
      'Scorpio': 'I embrace transformation and rise stronger each day.',
      'Sagittarius': 'I welcome adventure and grow through every experience.',
      'Capricorn': 'My discipline builds the future I dream of.',
      'Aquarius': 'My ideas matter and I create positive change.',
      'Pisces': 'I trust my intuition and let compassion guide me.',
    };
    return map[sign] ?? 'The universe is conspiring in my favour today.';
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

  // Honest empty state — shown when ProKerala can't be reached. We never fill
  // this with substitute text, so the user is never misled about the source.
  Widget _unavailableCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: Ob.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Ob.border),
        boxShadow: Ob.softShadow,
      ),
      child: Column(
        children: [
          const Icon(Icons.cloud_off_rounded, color: Ob.grey, size: 30),
          const SizedBox(height: 10),
          Text("Today's reading isn't available right now",
              textAlign: TextAlign.center,
              style: Ob.option.copyWith(fontWeight: FontWeight.w700, color: Ob.navy),),
          const SizedBox(height: 4),
          Text('Please check your connection and try again in a moment.',
              textAlign: TextAlign.center, style: Ob.note,),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: Ob.purpleDeep,
              side: const BorderSide(color: Ob.selectedBorder),
            ),
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}
