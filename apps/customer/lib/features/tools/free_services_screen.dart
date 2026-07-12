import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../profile_setup/onboarding_style.dart';
import 'horoscope_screen.dart';
import 'janam_kundli_screen.dart';
import 'kundali_match_screen.dart';

/// A hub for the free astrology tools — everything the user can explore without
/// spending from their wallet. Links the live ProKerala-backed features (daily
/// horoscope, janam kundli, kundali match) and previews what's coming next.
class FreeServicesScreen extends StatelessWidget {
  const FreeServicesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Ob.bgColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Ob.navy,
        title: Text('Free Services',
            style: GoogleFonts.cormorantGaramond(
                fontSize: 24, fontWeight: FontWeight.w700, color: Ob.navy,),),
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(18, 8, 18, 32 + MediaQuery.of(context).padding.bottom),
        children: [
          _hero(),
          const SizedBox(height: 20),
          _sectionTitle('Explore now'),
          const SizedBox(height: 12),
          _serviceCard(
            context,
            icon: Icons.wb_sunny_rounded,
            title: 'Daily Horoscope',
            subtitle: "Today's reading across love, career, health & more.",
            onTap: () => _push(context, const HoroscopeScreen()),
          ),
          const SizedBox(height: 12),
          _serviceCard(
            context,
            icon: Icons.auto_awesome_rounded,
            title: 'Janam Kundli',
            subtitle: 'Your birth chart, nakshatra, dosha, yogas & dasha.',
            onTap: () => _push(context, const JanamKundliScreen()),
          ),
          const SizedBox(height: 12),
          _serviceCard(
            context,
            icon: Icons.favorite_rounded,
            title: 'Kundali Match',
            subtitle: 'Ashtakoota compatibility out of 36 gunas.',
            onTap: () => _push(context, const KundaliMatchScreen()),
          ),
          const SizedBox(height: 24),
          _sectionTitle('Coming soon'),
          const SizedBox(height: 12),
          _serviceCard(
            context,
            icon: Icons.calendar_month_rounded,
            title: 'Panchang',
            subtitle: "Today's tithi, nakshatra, yoga & karana.",
            soon: true,
          ),
          const SizedBox(height: 12),
          _serviceCard(
            context,
            icon: Icons.schedule_rounded,
            title: 'Auspicious Timings',
            subtitle: 'Rahu kaal, gulika & the day’s shubh muhurat.',
            soon: true,
          ),
        ],
      ),
    );
  }

  void _push(BuildContext context, Widget screen) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));

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
        child: Row(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.14),
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0x55FFFFFF)),
              ),
              child: const Icon(Icons.card_giftcard_rounded, color: Color(0xFFF3D98A), size: 28),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('✦  ON THE HOUSE',
                      style: TextStyle(
                          color: Color(0xFFF3D98A),
                          fontSize: 11,
                          letterSpacing: 2,
                          fontWeight: FontWeight.w700,),),
                  const SizedBox(height: 4),
                  Text('Free astrology tools',
                      style: GoogleFonts.cormorantGaramond(
                          color: Colors.white, fontSize: 26, fontWeight: FontWeight.w700, height: 1.05,),),
                  const SizedBox(height: 2),
                  const Text('Explore your stars — no wallet needed.',
                      style: TextStyle(color: Color(0xCCFFFFFF), fontSize: 13),),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _sectionTitle(String t) => Text(t.toUpperCase(),
      style: Ob.sectionLabel.copyWith(fontSize: 12.5, letterSpacing: 1.2, color: Ob.grey),);

  Widget _serviceCard(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    VoidCallback? onTap,
    bool soon = false,
  }) {
    return GestureDetector(
      onTap: soon ? null : onTap,
      child: Container(
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
        child: Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: soon ? const Color(0x14322E63) : Ob.lavenderChip,
                borderRadius: BorderRadius.circular(13),
              ),
              child: Icon(icon, size: 24, color: soon ? Ob.grey : Ob.purple),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Ob.option.copyWith(fontSize: 15.5, fontWeight: FontWeight.w700, color: Ob.navy)),
                  const SizedBox(height: 3),
                  Text(subtitle, style: Ob.note.copyWith(fontSize: 12.5, color: Ob.grey, height: 1.35)),
                ],
              ),
            ),
            const SizedBox(width: 10),
            if (soon)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0x14322E63),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text('Soon',
                    style: Ob.note.copyWith(fontSize: 10.5, fontWeight: FontWeight.w800, color: Ob.grey),),
              )
            else
              const Icon(Icons.chevron_right_rounded, color: Ob.purple),
          ],
        ),
      ),
    );
  }
}
