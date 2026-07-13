import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../profile_setup/onboarding_style.dart';
import 'match_koota.dart';
import 'match_report_pdf.dart';

/// The read-only, beautiful Kundali Match report body — cosmic hero score card,
/// a "what this means" section, and the 8 rich koota cards. Shared by the live
/// result and the saved-report screen so both look identical.
class MatchReportView extends StatelessWidget {
  const MatchReportView({
    super.key,
    required this.data,
    required this.selfName,
    required this.partnerName,
  });

  final Map<String, dynamic> data;
  final String selfName;
  final String partnerName;

  @override
  Widget build(BuildContext context) {
    final gm = data['guna_milan'] is Map ? Map<String, dynamic>.from(data['guna_milan'] as Map) : null;
    final total = ((gm?['total_points'] ?? data['total_points']) as num?)?.toDouble() ?? 0;
    final max = ((gm?['maximum_points'] ?? data['maximum_points']) as num?)?.toDouble() ?? 36;
    final pct = (max > 0 ? (total / max) : 0.0).clamp(0.0, 1.0);
    final message = (data['message'] is Map ? data['message']['description'] : null)?.toString().trim();
    final kootas = kootaRows(data);
    final v = matchVerdict(total, max);
    final good = pct >= 0.5;
    final accent = good ? const Color(0xFF3FBE86) : Ob.gold;
    final tStr = total == total.roundToDouble() ? total.toStringAsFixed(0) : total.toStringAsFixed(1);
    final a = selfName.trim().isEmpty ? 'You' : selfName.trim();
    final b = partnerName.trim().isEmpty ? 'Partner' : partnerName.trim();

    return Column(
      children: [
        // ===== Hero score card =====
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(24, 26, 24, 26),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF2E2B5F), Color(0xFF5E3FBE), Color(0xFF7E57C2)],
            ),
            borderRadius: BorderRadius.circular(28),
            boxShadow: const [BoxShadow(color: Color(0x3325104F), blurRadius: 30, offset: Offset(0, 14))],
          ),
          child: Column(
            children: [
              Text('$a  ✦  $b',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.cormorantGaramond(fontSize: 23, fontWeight: FontWeight.w700, color: Colors.white),),
              const SizedBox(height: 4),
              Text('ASHTAKOOTA GUNA MILAN',
                  style: Ob.note.copyWith(color: Ob.gold, fontSize: 11, letterSpacing: 2, fontWeight: FontWeight.w700),),
              const SizedBox(height: 22),
              SizedBox(
                width: 138,
                height: 138,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    SizedBox(
                      width: 138,
                      height: 138,
                      child: CircularProgressIndicator(
                        value: pct,
                        strokeWidth: 9,
                        backgroundColor: Colors.white.withValues(alpha: 0.16),
                        valueColor: AlwaysStoppedAnimation(accent),
                      ),
                    ),
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(tStr,
                            style: GoogleFonts.cormorantGaramond(fontSize: 50, fontWeight: FontWeight.w700, color: Colors.white, height: 1),),
                        Text('of ${max.toStringAsFixed(0)} gunas',
                            style: Ob.note.copyWith(color: Colors.white.withValues(alpha: 0.7), fontSize: 11.5),),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(999)),
                child: Text(v.verdict, style: Ob.note.copyWith(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13)),
              ),
            ],
          ),
        ),

        // ===== What this means =====
        const SizedBox(height: 16),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(22), boxShadow: Ob.softShadow),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                const Icon(Icons.auto_awesome_rounded, size: 16, color: Ob.gold),
                const SizedBox(width: 7),
                Text('What this means', style: Ob.sectionLabel),
              ],),
              const SizedBox(height: 10),
              Text(v.summary, style: Ob.subtitle.copyWith(color: Ob.navy, height: 1.55)),
              if (message != null && message.isNotEmpty) ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: Ob.lavender, borderRadius: BorderRadius.circular(14)),
                  child: Text(message, style: Ob.subtitle.copyWith(color: Ob.navy, height: 1.55)),
                ),
              ],
            ],
          ),
        ),

        // ===== The 8 kootas =====
        if (kootas.isNotEmpty) ...[
          const SizedBox(height: 20),
          Align(
            alignment: Alignment.centerLeft,
            child: Row(children: [
              Text('The 8 Kootas', style: Ob.sectionLabel),
              const SizedBox(width: 8),
              Text('Ashtakoota breakdown', style: Ob.note.copyWith(color: Ob.grey)),
            ],),
          ),
          const SizedBox(height: 12),
          for (final k in kootas)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: Ob.border),
                boxShadow: Ob.softShadow,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text('${k['name'] ?? 'Koota'}', style: Ob.option.copyWith(fontWeight: FontWeight.w700))),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 4),
                        decoration: BoxDecoration(gradient: Ob.goldGradient, borderRadius: BorderRadius.circular(999)),
                        child: Text('${k['max'] ?? '—'} ${(k['max'] == 1) ? 'guna' : 'gunas'}',
                            style: Ob.note.copyWith(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 11),),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(child: _attrChip('You', '${k['girl'] ?? '—'}')),
                    const SizedBox(width: 10),
                    Expanded(child: _attrChip('Partner', '${k['boy'] ?? '—'}')),
                  ],),
                  if ((k['meaning'] as String?)?.isNotEmpty ?? false) ...[
                    const SizedBox(height: 12),
                    Text('${k['meaning']}', style: Ob.note.copyWith(color: Ob.grey, height: 1.45, fontSize: 12.5)),
                  ],
                ],
              ),
            ),
        ],
      ],
    );
  }

  Widget _attrChip(String label, String value) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: Ob.lavender, borderRadius: BorderRadius.circular(14)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label.toUpperCase(),
                style: Ob.note.copyWith(fontSize: 10, letterSpacing: 0.6, color: Ob.purpleDeep, fontWeight: FontWeight.w800),),
            const SizedBox(height: 3),
            Text(value, style: Ob.option.copyWith(fontWeight: FontWeight.w600, fontSize: 14)),
          ],
        ),
      );
}

/// Full-screen view of a saved report, with top + bottom Download / Share.
class MatchReportScreen extends StatefulWidget {
  const MatchReportScreen({
    super.key,
    required this.data,
    required this.selfName,
    required this.partnerName,
  });

  final Map<String, dynamic> data;
  final String selfName;
  final String partnerName;

  @override
  State<MatchReportScreen> createState() => _MatchReportScreenState();
}

class _MatchReportScreenState extends State<MatchReportScreen> {
  bool _busy = false;

  Future<void> _save({required bool share}) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final saved = await MatchReportPdf.generate(
        data: widget.data,
        selfName: widget.selfName,
        partnerName: widget.partnerName,
        share: share,
      );
      if (!mounted) return;
      if (!share && saved != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Download complete — saved to $saved')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Couldn't generate the report file.")));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Ob.bgColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Ob.navy,
        title: Text('Match Report',
            style: GoogleFonts.cormorantGaramond(fontSize: 24, fontWeight: FontWeight.w700, color: Ob.navy),),
        actions: [
          IconButton(
            tooltip: 'Download',
            icon: const Icon(Icons.download_rounded),
            onPressed: _busy ? null : () => _save(share: false),
          ),
          IconButton(
            tooltip: 'Share',
            icon: const Icon(Icons.ios_share_rounded),
            onPressed: _busy ? null : () => _save(share: true),
          ),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Ob.bgColor, Color(0xFFEDE6FB)],
          ),
        ),
        child: SafeArea(
          top: false,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            children: [
              MatchReportView(data: widget.data, selfName: widget.selfName, partnerName: widget.partnerName),
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: Ob.purple, padding: const EdgeInsets.symmetric(vertical: 14)),
                      onPressed: _busy ? null : () => _save(share: false),
                      icon: _busy
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.2))
                          : const Icon(Icons.download_rounded, size: 19),
                      label: const Text('Download'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: Ob.goldDeep, padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 6)),
                      onPressed: _busy ? null : () => _save(share: true),
                      icon: const Icon(Icons.ios_share_rounded, size: 17),
                      label: const FittedBox(fit: BoxFit.scaleDown, child: Text('Download & Share', maxLines: 1, softWrap: false)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
