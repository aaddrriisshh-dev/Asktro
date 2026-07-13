import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../app/providers.dart';
import '../../data/place_search_service.dart';
import '../profile_setup/onboarding_style.dart';
import 'match_report_pdf.dart';

/// Kundali Match (Ashtakoota Guna Milan). Two birth-detail cards — yours
/// (pre-filled from your profile, editable) and your partner's — joined by a
/// match glyph, then a compatibility score + koota breakdown from ProKerala.
class KundaliMatchScreen extends ConsumerStatefulWidget {
  const KundaliMatchScreen({super.key});

  @override
  ConsumerState<KundaliMatchScreen> createState() => _KundaliMatchScreenState();
}

/// One person's birth entry — name, date, time, place (+ resolved coordinates).
class _Person {
  _Person(this.role);
  final String role;
  final name = TextEditingController();
  final place = TextEditingController();
  DateTime? dob;
  TimeOfDay? time;
  PlaceResult? placeResult;
  List<PlaceResult> suggestions = const [];
  Timer? searchDebounce;

  bool get complete => dob != null && placeResult != null;

  void dispose() {
    searchDebounce?.cancel();
    name.dispose();
    place.dispose();
  }
}

class _KundaliMatchScreenState extends ConsumerState<KundaliMatchScreen> {
  final _self = _Person('you');
  final _partner = _Person('partner');
  final _places = PlaceSearchService();
  bool _prefilled = false;

  static const _pricePaise = 4900; // ₹49 — must match the server price

  bool _loading = false;
  bool _downloading = false;
  Map<String, dynamic>? _result;
  String? _error;

  @override
  void dispose() {
    _self.dispose();
    _partner.dispose();
    super.dispose();
  }

  void _prefillSelf() {
    if (_prefilled) return;
    final p = ref.read(myProfileProvider).valueOrNull;
    if (p == null) return;
    _prefilled = true;
    _self.name.text = p.name;
    if (p.birthDateMs != null) _self.dob = DateTime.fromMillisecondsSinceEpoch(p.birthDateMs!);
    if (p.birthTimeKnown && p.birthTime != null && p.birthTime!.contains(':')) {
      final parts = p.birthTime!.split(':');
      _self.time = TimeOfDay(hour: int.tryParse(parts[0]) ?? 12, minute: int.tryParse(parts[1]) ?? 0);
    }
    if (p.birthPlace != null && p.birthPlace!.trim().isNotEmpty) {
      _self.place.text = p.birthPlace!;
      if (p.birthLat != null && p.birthLng != null) {
        _self.placeResult = PlaceResult(label: p.birthPlace!, lat: p.birthLat!, lon: p.birthLng!);
      } else {
        // Older profile with a place but no saved coordinates — geocode it so the
        // "you" side is complete and the compatibility button can enable.
        _resolveSelfCoords(p.birthPlace!);
      }
    }
  }

  Future<void> _resolveSelfCoords(String place) async {
    final hits = await _places.search(place);
    final first = hits.isNotEmpty ? hits.first : null;
    if (first?.lat != null && first?.lon != null && mounted) {
      setState(() => _self.placeResult = PlaceResult(label: place, lat: first!.lat, lon: first.lon));
    }
  }

  Future<void> _pickDate(_Person who) async {
    final d = await showDatePicker(
      context: context,
      initialDate: who.dob ?? DateTime(1995, 1, 1),
      firstDate: DateTime(1930),
      lastDate: DateTime.now(),
    );
    if (d != null) setState(() => who.dob = d);
  }

  Future<void> _pickTime(_Person who) async {
    final t = await showTimePicker(context: context, initialTime: who.time ?? const TimeOfDay(hour: 12, minute: 0));
    if (t != null) setState(() => who.time = t);
  }

  /// Debounced place lookup — Nominatim's usage policy expects human-paced,
  /// ~1/sec querying; firing on every keystroke gets the app rate-limited and
  /// then it stops returning results entirely. Wait 450ms after typing stops.
  void _searchPlace(_Person who, String raw) {
    who.searchDebounce?.cancel();
    final q = raw.trim();
    if (q.length < 2) {
      setState(() => who.suggestions = const []);
      return;
    }
    who.searchDebounce = Timer(const Duration(milliseconds: 450), () async {
      final hits = await _places.search(q);
      if (!mounted || q != who.place.text.trim()) return;
      setState(() => who.suggestions = hits);
    });
  }

  bool get _canSubmit => _self.complete && _partner.complete && !_loading;

  String _isoOf(_Person who) {
    final repo = ref.read(prokeralaRepositoryProvider)!;
    final hhmm = who.time == null
        ? null
        : '${who.time!.hour.toString().padLeft(2, '0')}:${who.time!.minute.toString().padLeft(2, '0')}';
    return repo.isoFor(who.dob!, hhmm);
  }

  int get _spendable => ref.read(myProfileProvider).valueOrNull?.spendablePaise ?? 0;

  /// Send the user to Recharge and wait until they come back (go_router push
  /// resolves on pop). The wallet stream refreshes the balance on return.
  Future<void> _goRecharge() async {
    await context.push('/recharge');
  }

  /// Paid flow: check ₹49 balance → (recharge if short, then return) → charge +
  /// fetch the full report on the server. The client never deducts — the server
  /// function does, atomically, and only if ProKerala returned a report.
  Future<void> _checkCompatibility() async {
    final profile = ref.read(myProfileProvider).valueOrNull;
    final repo = ref.read(prokeralaRepositoryProvider);
    if (repo == null || !_self.complete || !_partner.complete) return;

    // Balance gate BEFORE charging: if short, take them to recharge and return.
    if (_spendable < _pricePaise) {
      setState(() => _error = null);
      await _goRecharge();
      if (!mounted) return;
      if (_spendable < _pricePaise) {
        setState(() => _error = 'Add at least ₹49 to your wallet, then tap “Check compatibility” again.');
        return;
      }
    }

    setState(() {
      _loading = true;
      _error = null;
      _result = null;
    });

    final selfCoords = '${_self.placeResult!.lat},${_self.placeResult!.lon}';
    final partnerCoords = '${_partner.placeResult!.lat},${_partner.placeResult!.lon}';
    final selfIso = _isoOf(_self);
    final partnerIso = _isoOf(_partner);

    // ProKerala matching is girl + boy. Map "you" by your saved gender.
    final selfIsGirl = profile?.gender == 'female';
    try {
      final res = await repo.purchaseMatch(
        girlDatetime: selfIsGirl ? selfIso : partnerIso,
        girlCoordinates: selfIsGirl ? selfCoords : partnerCoords,
        boyDatetime: selfIsGirl ? partnerIso : selfIso,
        boyCoordinates: selfIsGirl ? partnerCoords : selfCoords,
        selfName: _self.name.text.trim().isEmpty ? (profile?.name ?? '') : _self.name.text.trim(),
        partnerName: _partner.name.text.trim(),
      );
      if (!mounted) return;
      final data = res['data'];
      setState(() {
        _loading = false;
        _result = data is Map ? Map<String, dynamic>.from(data) : null;
        if (_result == null) _error = "We couldn't generate your report right now. You were not charged.";
      });
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      if (e.message == 'INSUFFICIENT_BALANCE') {
        await _goRecharge();
        if (mounted) setState(() => _error = 'Please add ₹49 to your wallet, then tap “Check compatibility” again.');
      } else {
        setState(() => _error = 'The astrology service is momentarily unavailable. You were not charged.');
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Something went wrong. If money was deducted it will reflect in Transactions.';
      });
    }
  }

  Future<void> _downloadReport(Map<String, dynamic> data) async {
    if (_downloading) return;
    setState(() => _downloading = true);
    try {
      await MatchReportPdf.shareReport(
        data: data,
        selfName: _self.name.text,
        partnerName: _partner.name.text,
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Couldn't generate the report file.")),
        );
      }
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    _prefillSelf();
    return Scaffold(
      backgroundColor: Ob.bgColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Ob.navy,
        title: Text('Kundali Match',
            style: GoogleFonts.cormorantGaramond(
                fontSize: 24, fontWeight: FontWeight.w700, color: Ob.navy,),),
      ),
      // Celestial backdrop: a soft vertical wash with faint sparkles behind the
      // whole flow, so the screen feels cosmic without hurting readability.
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFF1ECFB), Color(0xFFFBF8FF), Color(0xFFFFFDF7)],
          ),
        ),
        child: Stack(
          children: [
            const Positioned(top: 30, right: 26, child: Icon(Icons.auto_awesome, size: 16, color: Color(0x337E57C2))),
            const Positioned(top: 120, left: 20, child: Icon(Icons.star_rounded, size: 12, color: Color(0x33E7B84B))),
            const Positioned(top: 210, right: 40, child: Icon(Icons.star_rounded, size: 10, color: Color(0x337E57C2))),
            ListView(
              padding: EdgeInsets.fromLTRB(18, 8, 18, 32 + MediaQuery.of(context).padding.bottom),
              children: [
                _intro(),
                const SizedBox(height: 18),
                if (_result == null) ...[
                  _personCard(_self, 'Your details', Icons.person_rounded, const Color(0xFF7E57C2)),
                  _matchGlyph(),
                  _personCard(_partner, "Partner's details", Icons.favorite_rounded, const Color(0xFFC96D8E)),
                  const SizedBox(height: 20),
                  _submitButton(),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, textAlign: TextAlign.center, style: Ob.note.copyWith(color: const Color(0xFFC0392B))),
                  ],
                ] else
                  _resultView(_result!),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _intro() => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF322E63), Color(0xFF5E3FBE)],
          ),
          borderRadius: BorderRadius.circular(20),
          boxShadow: Ob.softShadow,
        ),
        child: Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.14),
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0x55FFFFFF)),),
              child: const Icon(Icons.favorite_rounded, color: Color(0xFFF3D98A), size: 26),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Ashtakoota Guna Milan',
                      style: GoogleFonts.cormorantGaramond(
                          color: Colors.white, fontSize: 21, fontWeight: FontWeight.w700,),),
                  const SizedBox(height: 2),
                  const Text('A complete 8-koota compatibility report, scored out of 36 gunas — with a downloadable PDF.',
                      style: TextStyle(color: Color(0xCCFFFFFF), fontSize: 12.5, height: 1.35),),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0x33F3D98A),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: const Color(0x55F3D98A)),
                    ),
                    child: const Text('Full report · just ₹49',
                        style: TextStyle(color: Color(0xFFF3D98A), fontSize: 11.5, fontWeight: FontWeight.w800),),
                  ),
                ],
              ),
            ),
          ],
        ),
      );

  // The interlocking-rings glyph between the two people, signalling the match.
  Widget _matchGlyph() => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Column(
          children: [
            Container(width: 1.4, height: 16, color: const Color(0xFFD9CDF0)),
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF7E57C2), Color(0xFFC96D8E)],
                ),
                shape: BoxShape.circle,
                boxShadow: Ob.softShadow,
                border: Border.all(color: Colors.white, width: 2),
              ),
              child: const Icon(Icons.favorite_rounded, color: Colors.white, size: 22),
            ),
            Container(width: 1.4, height: 16, color: const Color(0xFFD9CDF0)),
          ],
        ),
      );

  Widget _personCard(_Person who, String title, IconData icon, Color accent) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: accent.withValues(alpha: 0.25), width: 1.3),
        boxShadow: Ob.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(color: accent.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(9)),
                child: Icon(icon, size: 17, color: accent),
              ),
              const SizedBox(width: 10),
              Text(title, style: Ob.sectionLabel),
              const Spacer(),
              if (who.complete) Icon(Icons.check_circle_rounded, size: 18, color: accent),
            ],
          ),
          const SizedBox(height: 14),
          TextField(
            controller: who.name,
            decoration: _dec('Name (optional)', Icons.badge_outlined),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _pickerField('Date of birth',
                    who.dob == null ? null : DateFormat('d MMM yyyy').format(who.dob!),
                    Icons.calendar_today_rounded, () => _pickDate(who),),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _pickerField('Time (optional)', who.time?.format(context),
                    Icons.schedule_rounded, () => _pickTime(who),),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: who.place,
            decoration: _dec('Birth place', Icons.place_outlined),
            onChanged: (v) {
              // Typing invalidates any previously picked coordinates.
              setState(() => who.placeResult = null);
              _searchPlace(who, v);
            },
          ),
          if (who.placeResult == null && who.suggestions.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(top: 6),
              decoration: BoxDecoration(
                  color: Ob.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: Ob.border),),
              child: Column(
                children: [
                  for (final s in who.suggestions.take(5))
                    ListTile(
                      dense: true,
                      title: Text(s.label, style: Ob.note.copyWith(color: Ob.navy)),
                      onTap: () => setState(() {
                        who.placeResult = s;
                        who.place.text = s.label;
                        who.suggestions = const [];
                      }),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  InputDecoration _dec(String hint, IconData icon) => InputDecoration(
        hintText: hint,
        prefixIcon: Icon(icon, size: 20, color: Ob.purple),
        filled: true,
        fillColor: Ob.surface,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Ob.border)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Ob.border)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Ob.purple)),
      );

  Widget _pickerField(String label, String? value, IconData icon, VoidCallback onTap) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
          decoration: BoxDecoration(
              color: Ob.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: Ob.border),),
          child: Row(
            children: [
              Icon(icon, size: 18, color: Ob.purple),
              const SizedBox(width: 8),
              Expanded(
                child: Text(value ?? label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Ob.note.copyWith(color: value == null ? Ob.grey : Ob.navy),),
              ),
            ],
          ),
        ),
      );

  Widget _submitButton() => SizedBox(
        width: double.infinity,
        child: FilledButton.icon(
          style: FilledButton.styleFrom(
              backgroundColor: Ob.purple, padding: const EdgeInsets.symmetric(vertical: 15),),
          onPressed: _canSubmit ? _checkCompatibility : null,
          icon: _loading
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.2))
              : const Icon(Icons.favorite_rounded, size: 18),
          label: Text(_loading ? 'Generating your report…' : 'Check compatibility · ₹49'),
        ),
      );

  // ---- result ----
  Widget _resultView(Map<String, dynamic> data) {
    final gm = data['guna_milan'] is Map ? Map<String, dynamic>.from(data['guna_milan'] as Map) : null;
    final total = ((gm?['total_points'] ?? data['total_points']) as num?)?.toDouble() ?? 0;
    final max = ((gm?['maximum_points'] ?? data['maximum_points']) as num?)?.toDouble() ?? 36;
    final pct = max > 0 ? (total / max) : 0.0;
    final message = (data['message'] is Map ? data['message']['description'] : null)?.toString();
    final kootas = data['koota'] is List
        ? List<Map<String, dynamic>>.from((data['koota'] as List).whereType<Map>().map((e) => Map<String, dynamic>.from(e)))
        : <Map<String, dynamic>>[];
    final verdict = pct >= 0.75
        ? 'Excellent match'
        : pct >= 0.5
            ? 'Good match'
            : pct >= 0.3
                ? 'Average match'
                : 'Needs consideration';

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: pct >= 0.5 ? const [Color(0xFFE9F6EF), Color(0xFFFBF6FF)] : const [Color(0xFFFBF1E3), Color(0xFFFBF6FF)],
            ),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: Ob.selectedBorder.withValues(alpha: 0.5)),
            boxShadow: Ob.softShadow,
          ),
          child: Column(
            children: [
              Text('Guna Milan', style: Ob.sectionLabel),
              const SizedBox(height: 6),
              Text(verdict,
                  style: Ob.note.copyWith(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: pct >= 0.5 ? const Color(0xFF2F9C63) : Ob.goldDeep,),),
              const SizedBox(height: 10),
              Text('${total.toStringAsFixed(total == total.roundToDouble() ? 0 : 1)} / ${max.toStringAsFixed(0)}',
                  style: GoogleFonts.cormorantGaramond(fontSize: 44, fontWeight: FontWeight.w700, color: Ob.purpleDeep,),),
              const SizedBox(height: 10),
              ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: LinearProgressIndicator(
                  value: pct.clamp(0, 1),
                  minHeight: 10,
                  backgroundColor: const Color(0xFFEDE6FA),
                  valueColor: AlwaysStoppedAnimation(pct >= 0.5 ? const Color(0xFF2F9C63) : Ob.gold),
                ),
              ),
              if (message != null) ...[
                const SizedBox(height: 14),
                Text(message, textAlign: TextAlign.center, style: Ob.subtitle.copyWith(color: Ob.navy, height: 1.5)),
              ],
            ],
          ),
        ),
        if (kootas.isNotEmpty) ...[
          const SizedBox(height: 16),
          Align(alignment: Alignment.centerLeft, child: Text('Koota breakdown', style: Ob.sectionLabel)),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), boxShadow: Ob.softShadow),
            child: Column(
              children: [
                for (var i = 0; i < kootas.length; i++)
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      border: i == kootas.length - 1 ? null : const Border(bottom: BorderSide(color: Color(0xFFF1ECFB))),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(child: Text('${kootas[i]['name'] ?? 'Koota'}', style: Ob.option.copyWith(fontWeight: FontWeight.w700))),
                            Text('${(kootas[i]['obtained_points'] as num?)?.toString() ?? '—'} / ${(kootas[i]['maximum_points'] as num?)?.toString() ?? '—'}',
                                style: Ob.note.copyWith(fontWeight: FontWeight.w800, color: Ob.purpleDeep),),
                          ],
                        ),
                        if ((kootas[i]['description'] as String?)?.trim().isNotEmpty ?? false) ...[
                          const SizedBox(height: 4),
                          Text('${kootas[i]['description']}',
                              style: Ob.note.copyWith(fontSize: 12.5, color: Ob.grey, height: 1.35),),
                        ],
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 18),
        // The paid deliverable: a downloadable / shareable PDF report.
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: Ob.purple, padding: const EdgeInsets.symmetric(vertical: 14)),
            onPressed: _downloading ? null : () => _downloadReport(data),
            icon: _downloading
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.2))
                : const Icon(Icons.download_rounded, size: 19),
            label: Text(_downloading ? 'Preparing report…' : 'Download full report (PDF)'),
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            style: OutlinedButton.styleFrom(foregroundColor: Ob.purpleDeep, side: const BorderSide(color: Ob.selectedBorder), padding: const EdgeInsets.symmetric(vertical: 13)),
            onPressed: () => setState(() {
              _result = null;
              _error = null;
            }),
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Check another match'),
          ),
        ),
      ],
    );
  }
}
