import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../app/providers.dart';
import '../../data/place_search_service.dart';
import '../profile_setup/onboarding_style.dart';

/// Kundali Match (Ashtakoota Guna Milan). The signed-in user is one partner
/// (from their saved birth details); they enter the other partner's birth
/// details, and we show the ProKerala compatibility score + koota breakdown.
class KundaliMatchScreen extends ConsumerStatefulWidget {
  const KundaliMatchScreen({super.key});

  @override
  ConsumerState<KundaliMatchScreen> createState() => _KundaliMatchScreenState();
}

class _KundaliMatchScreenState extends ConsumerState<KundaliMatchScreen> {
  final _name = TextEditingController();
  final _place = TextEditingController();
  final _places = PlaceSearchService();
  DateTime? _dob;
  TimeOfDay? _time;
  PlaceResult? _placeResult;
  List<PlaceResult> _suggestions = const [];

  bool _loading = false;
  Map<String, dynamic>? _result;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _place.dispose();
    super.dispose();
  }

  bool get _canSubmit => _dob != null && _placeResult != null && !_loading;

  Future<void> _pickDate() async {
    final d = await showDatePicker(
      context: context,
      initialDate: DateTime(1995, 1, 1),
      firstDate: DateTime(1930),
      lastDate: DateTime.now(),
    );
    if (d != null) setState(() => _dob = d);
  }

  Future<void> _pickTime() async {
    final t = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 12, minute: 0));
    if (t != null) setState(() => _time = t);
  }

  Future<void> _searchPlace(String q) async {
    final hits = await _places.search(q);
    if (mounted) setState(() => _suggestions = hits);
  }

  Future<void> _match() async {
    final profile = ref.read(myProfileProvider).valueOrNull;
    final repo = ref.read(prokeralaRepositoryProvider);
    if (profile == null || repo == null || _dob == null || _placeResult == null) return;
    setState(() {
      _loading = true;
      _error = null;
      _result = null;
    });

    final self = await repo.selfBirth(profile);
    if (self == null) {
      setState(() {
        _loading = false;
        _error = 'Add your own birth place in Edit Profile first.';
      });
      return;
    }

    final partnerIso = repo.isoFor(
        _dob!,
        _time == null ? null : '${_time!.hour.toString().padLeft(2, '0')}:${_time!.minute.toString().padLeft(2, '0')}',);
    final partnerCoords = '${_placeResult!.lat},${_placeResult!.lon}';

    // ProKerala matching is girl + boy. Map by the user's gender.
    final userIsGirl = profile.gender == 'female';
    try {
      final data = await repo.kundliMatch(
        girlDatetime: userIsGirl ? self.datetime : partnerIso,
        girlCoordinates: userIsGirl ? self.coordinates : partnerCoords,
        boyDatetime: userIsGirl ? partnerIso : self.datetime,
        boyCoordinates: userIsGirl ? partnerCoords : self.coordinates,
      );
      if (!mounted) return;
      setState(() {
        _loading = false;
        _result = data;
        if (data == null) _error = "We couldn't check compatibility right now.";
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = "We couldn't check compatibility right now.";
      });
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
        title: Text('Kundali Match',
            style: GoogleFonts.cormorantGaramond(
                fontSize: 24, fontWeight: FontWeight.w700, color: Ob.navy,),),
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(18, 8, 18, 32 + MediaQuery.of(context).padding.bottom),
        children: [
          _intro(),
          const SizedBox(height: 16),
          if (_result == null) ...[
            _form(),
            const SizedBox(height: 18),
            _submitButton(),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, textAlign: TextAlign.center, style: Ob.note.copyWith(color: const Color(0xFFC0392B))),
            ],
          ] else
            _resultView(_result!),
        ],
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
                  const Text('Enter your partner’s birth details to check compatibility out of 36 gunas.',
                      style: TextStyle(color: Color(0xCCFFFFFF), fontSize: 12.5, height: 1.35),),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _form() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: Ob.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("Partner's details", style: Ob.sectionLabel),
          const SizedBox(height: 14),
          TextField(
            controller: _name,
            decoration: _dec('Name (optional)', Icons.person_outline_rounded),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _pickerField('Date of birth', _dob == null ? null : DateFormat('d MMM yyyy').format(_dob!), Icons.calendar_today_rounded, _pickDate)),
              const SizedBox(width: 12),
              Expanded(child: _pickerField('Time (optional)', _time?.format(context), Icons.schedule_rounded, _pickTime)),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _place,
            decoration: _dec('Birth place', Icons.place_outlined),
            onChanged: (v) {
              _placeResult = null;
              if (v.trim().length >= 2) _searchPlace(v);
            },
          ),
          if (_placeResult == null && _suggestions.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(top: 6),
              decoration: BoxDecoration(
                  color: Ob.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: Ob.border),),
              child: Column(
                children: [
                  for (final s in _suggestions.take(5))
                    ListTile(
                      dense: true,
                      title: Text(s.label, style: Ob.note.copyWith(color: Ob.navy)),
                      onTap: () => setState(() {
                        _placeResult = s;
                        _place.text = s.label;
                        _suggestions = const [];
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
          onPressed: _canSubmit ? _match : null,
          icon: _loading
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.2))
              : const Icon(Icons.favorite_rounded, size: 18),
          label: Text(_loading ? 'Matching…' : 'Check compatibility'),
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
              const SizedBox(height: 12),
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
                    child: Row(
                      children: [
                        Expanded(child: Text('${kootas[i]['name'] ?? 'Koota'}', style: Ob.option.copyWith(fontWeight: FontWeight.w600))),
                        Text('${(kootas[i]['obtained_points'] as num?)?.toString() ?? '—'} / ${(kootas[i]['maximum_points'] as num?)?.toString() ?? '—'}',
                            style: Ob.note.copyWith(fontWeight: FontWeight.w700, color: Ob.purpleDeep),),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 18),
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
