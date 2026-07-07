import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../profile_setup/onboarding_style.dart';

/// Account details — view and edit name + email; phone is read-only (it's the
/// login identity). Wired to the pencil icon on the Profile header.
class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  bool _prefilled = false;
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
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

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(myProfileProvider).valueOrNull;
    if (profile != null && !_prefilled) {
      _prefilled = true;
      _name.text = profile.name == 'Guest' ? '' : profile.name;
      _email.text = profile.email ?? '';
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
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                _field('Name', _name, hint: 'Your full name', icon: Icons.person_outline_rounded),
                const SizedBox(height: 16),
                _field('Email', _email,
                    hint: 'you@email.com',
                    icon: Icons.mail_outline_rounded,
                    keyboardType: TextInputType.emailAddress),
                const SizedBox(height: 16),
                _readOnly('Phone', profile.phone.isEmpty ? '—' : profile.phone,
                    icon: Icons.phone_iphone_rounded),
                const SizedBox(height: 28),
                GestureDetector(
                  onTap: _saving ? null : () => _save(profile),
                  child: Container(
                    height: 54,
                    decoration: BoxDecoration(
                      gradient: Ob.goldGradient,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Center(
                      child: _saving
                          ? const SizedBox(
                              width: 22, height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : Text('Save changes',
                              style: Ob.option.copyWith(fontWeight: FontWeight.w700)),
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _label(String t) => Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 8),
        child: Text(t, style: Ob.note.copyWith(fontWeight: FontWeight.w600, letterSpacing: 1)),
      );

  Widget _field(String label, TextEditingController c,
      {required String hint, required IconData icon, TextInputType? keyboardType}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label(label.toUpperCase()),
        TextField(
          controller: c,
          keyboardType: keyboardType,
          style: Ob.option,
          decoration: InputDecoration(
            hintText: hint,
            prefixIcon: Icon(icon, color: Ob.purple, size: 20),
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: Ob.border)),
            enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: Ob.border)),
            focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: Ob.purple)),
          ),
        ),
      ],
    );
  }

  Widget _readOnly(String label, String value, {required IconData icon}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label(label.toUpperCase()),
        Container(
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
            Text(value, style: Ob.option),
            const Spacer(),
            Icon(Icons.lock_outline_rounded, color: const Color(0xFFB9B3C9), size: 16),
          ]),
        ),
      ],
    );
  }
}
