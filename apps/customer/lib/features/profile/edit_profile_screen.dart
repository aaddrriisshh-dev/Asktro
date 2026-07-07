import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../profile_setup/onboarding_style.dart';

/// Full account / astrology profile — identity (name, email, phone) plus the
/// birth details used for the chart. Everything the astrologer needs is stored
/// here so it can travel with a consultation request. Phone is read-only (login
/// identity).
class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

const _kLanguages = [
  'Hindi', 'English', 'Bengali', 'Tamil', 'Telugu', 'Kannada',
  'Marathi', 'Punjabi', 'Gujarati', 'Malayalam', 'Odia', 'Urdu',
];

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _place = TextEditingController();

  String? _gender;
  DateTime? _birthDate;
  TimeOfDay? _birthTime;
  bool _timeKnown = true;
  String? _relationship;
  final Set<String> _languages = {};

  bool _prefilled = false;
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _place.dispose();
    super.dispose();
  }

  void _prefill(UserProfile p) {
    _name.text = p.name == 'Guest' ? '' : p.name;
    _email.text = p.email ?? '';
    _place.text = p.birthPlace ?? '';
    _gender = p.gender;
    _birthDate = p.birthDate;
    _timeKnown = p.birthTimeKnown;
    if (p.birthTime != null && p.birthTime!.contains(':')) {
      final parts = p.birthTime!.split(':');
      final h = int.tryParse(parts[0]);
      final m = int.tryParse(parts[1]);
      if (h != null && m != null) _birthTime = TimeOfDay(hour: h, minute: m);
    }
    _relationship = p.relationshipStatus;
    _languages
      ..clear()
      ..addAll(p.languages);
  }

  String? _birthTime24() {
    if (!_timeKnown || _birthTime == null) return null;
    return '${_birthTime!.hour.toString().padLeft(2, '0')}:${_birthTime!.minute.toString().padLeft(2, '0')}';
  }

  Future<void> _save(UserProfile profile) async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Please enter your name.')));
      return;
    }
    setState(() => _saving = true);
    try {
      await ref.read(userRepositoryProvider).updateProfile(profile.id, {
        'name': name,
        'email': _email.text.trim(),
        'gender': _gender,
        'birthDateMs': _birthDate?.millisecondsSinceEpoch,
        'birthTimeKnown': _timeKnown,
        'birthTime': _birthTime24(),
        'birthPlace': _place.text.trim(),
        'relationshipStatus': _relationship,
        'languages': _languages.toList(),
        'onboardingComplete': true,
      });
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Profile updated.')));
      Navigator.of(context).maybePop();
    } catch (_) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Could not save. Please try again.')));
    }
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _birthDate ?? DateTime(now.year - 25),
      firstDate: DateTime(1920),
      lastDate: now,
    );
    if (picked != null) setState(() => _birthDate = picked);
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(context: context, initialTime: _birthTime ?? const TimeOfDay(hour: 9, minute: 0));
    if (picked != null) setState(() {
      _birthTime = picked;
      _timeKnown = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(myProfileProvider).valueOrNull;
    if (profile != null && !_prefilled) {
      _prefilled = true;
      _prefill(profile);
    }
    return Scaffold(
      backgroundColor: Ob.bgColor,
      appBar: AppBar(
        backgroundColor: Ob.bgColor,
        elevation: 0,
        foregroundColor: Ob.purpleDeep,
        title: const Text('Account details'),
      ),
      body: profile == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: EdgeInsets.fromLTRB(20, 8, 20, 40 + MediaQuery.of(context).padding.bottom),
              children: [
                _label('IDENTITY'),
                _text('Name', _name, hint: 'Your full name', icon: Icons.person_outline_rounded),
                const SizedBox(height: 14),
                _text('Email', _email,
                    hint: 'you@email.com',
                    icon: Icons.mail_outline_rounded,
                    keyboardType: TextInputType.emailAddress),
                const SizedBox(height: 14),
                _readOnly('Phone', profile.phone.isEmpty ? '—' : profile.phone,
                    icon: Icons.phone_iphone_rounded),
                const SizedBox(height: 24),
                _label('BIRTH DETAILS (FOR YOUR CHART)'),
                _chips('Gender', const {'male': 'Male', 'female': 'Female'}, _gender,
                    (v) => setState(() => _gender = v)),
                const SizedBox(height: 14),
                _pickerRow('Date of birth',
                    _birthDate == null
                        ? 'Select date'
                        : '${_birthDate!.day}/${_birthDate!.month}/${_birthDate!.year}',
                    Icons.cake_outlined, _pickDate),
                const SizedBox(height: 14),
                _pickerRow('Time of birth',
                    !_timeKnown
                        ? "Don't know"
                        : (_birthTime == null ? 'Select time' : _birthTime!.format(context)),
                    Icons.schedule_rounded, _pickTime),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () => setState(() => _timeKnown = !_timeKnown),
                    child: Text(_timeKnown ? "I don't know my birth time" : 'I do know my birth time',
                        style: Ob.note.copyWith(color: Ob.purple)),
                  ),
                ),
                _text('Birth place', _place,
                    hint: 'City, Country', icon: Icons.place_outlined),
                const SizedBox(height: 24),
                _label('ABOUT YOU'),
                _chips(
                    'Relationship',
                    const {'single': 'Single', 'in_relationship': 'In a relationship', 'married': 'Married'},
                    _relationship,
                    (v) => setState(() => _relationship = v)),
                const SizedBox(height: 14),
                _label('LANGUAGES'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final lang in _kLanguages)
                      _langChip(lang, _languages.contains(lang), () => setState(() {
                            if (_languages.contains(lang)) {
                              _languages.remove(lang);
                            } else {
                              _languages.add(lang);
                            }
                          })),
                  ],
                ),
                const SizedBox(height: 28),
                GestureDetector(
                  onTap: _saving ? null : () => _save(profile),
                  child: Container(
                    height: 54,
                    decoration: BoxDecoration(gradient: Ob.goldGradient, borderRadius: BorderRadius.circular(16)),
                    child: Center(
                      child: _saving
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : Text('Save changes', style: Ob.option.copyWith(fontWeight: FontWeight.w700)),
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _label(String t) => Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 8, top: 4),
        child: Text(t, style: Ob.note.copyWith(fontWeight: FontWeight.w600, letterSpacing: 1)),
      );

  Widget _text(String label, TextEditingController c,
      {required String hint, required IconData icon, TextInputType? keyboardType}) {
    return TextField(
      controller: c,
      keyboardType: keyboardType,
      style: Ob.option,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: Icon(icon, color: Ob.purple, size: 20),
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: Ob.border)),
        enabledBorder:
            OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: Ob.border)),
        focusedBorder:
            OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: Ob.purple)),
      ),
    );
  }

  Widget _readOnly(String label, String value, {required IconData icon}) {
    return Container(
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF3F0FA),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Ob.border),
      ),
      child: Row(children: [
        Icon(icon, color: Ob.purple, size: 20),
        const SizedBox(width: 12),
        Text('$label:  ', style: Ob.note),
        Text(value, style: Ob.option),
        const Spacer(),
        const Icon(Icons.lock_outline_rounded, color: Color(0xFFB9B3C9), size: 16),
      ]),
    );
  }

  Widget _pickerRow(String label, String value, IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 56,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Ob.border),
        ),
        child: Row(children: [
          Icon(icon, color: Ob.purple, size: 20),
          const SizedBox(width: 12),
          Text('$label:  ', style: Ob.note),
          Text(value, style: Ob.option),
          const Spacer(),
          const Icon(Icons.chevron_right_rounded, color: Color(0xFFB9B3C9)),
        ]),
      ),
    );
  }

  Widget _chips(String label, Map<String, String> options, String? selected, ValueChanged<String> onSelect) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(padding: const EdgeInsets.only(left: 4, bottom: 8), child: Text(label, style: Ob.note)),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final e in options.entries) _langChip(e.value, selected == e.key, () => onSelect(e.key)),
          ],
        ),
      ],
    );
  }

  Widget _langChip(String text, bool on, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: on ? Ob.lavenderChip : Colors.white,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: on ? Ob.purple : Ob.border, width: on ? 1.5 : 1),
        ),
        child: Text(text,
            style: Ob.note.copyWith(
                color: on ? Ob.purpleDeep : const Color(0xFF6B6580),
                fontWeight: on ? FontWeight.w700 : FontWeight.w500)),
      ),
    );
  }
}
