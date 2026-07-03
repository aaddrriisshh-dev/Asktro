import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../profile_setup/onboarding_style.dart';
import '../profile_setup/onboarding_widgets.dart';

// [code, english name, native name]
const _languages = [
  ['en', 'English', 'English'],
  ['hi', 'Hindi', 'हिन्दी'],
  ['mr', 'Marathi', 'मराठी'],
  ['pa', 'Punjabi', 'ਪੰਜਾਬੀ'],
  ['te', 'Telugu', 'తెలుగు'],
  ['kn', 'Kannada', 'ಕನ್ನಡ'],
];

String languageName(String code) =>
    _languages.firstWhere((l) => l[0] == code, orElse: () => _languages.first)[1];

void showLanguageSheet(BuildContext context) {
  showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => const _LanguageSheet(),
  );
}

class _LanguageSheet extends ConsumerStatefulWidget {
  const _LanguageSheet();
  @override
  ConsumerState<_LanguageSheet> createState() => _LanguageSheetState();
}

class _LanguageSheetState extends ConsumerState<_LanguageSheet> {
  late String _sel = ref.read(appLanguageProvider);
  bool _saving = false;

  Future<void> _apply() async {
    setState(() => _saving = true);
    ref.read(appLanguageProvider.notifier).state = _sel;
    final uid = ref.read(currentUidProvider);
    if (uid != null) {
      await ref.read(userRepositoryProvider).updateProfile(uid, {'appLanguage': _sel});
    }
    if (!mounted) return;
    Navigator.pop(context);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Language set to ${languageName(_sel)}. More screens are being translated.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Ob.bgColor,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 44,
            height: 4,
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(color: Ob.border, borderRadius: BorderRadius.circular(2)),
          ),
          Text('Choose your language', style: Ob.title),
          const SizedBox(height: 6),
          Text('You can change this anytime', style: Ob.subtitle),
          const SizedBox(height: 18),
          for (final l in _languages) _tile(l[0], l[1], l[2]),
          const SizedBox(height: 18),
          GoldButton(label: 'Apply', icon: null, loading: _saving, onPressed: _saving ? null : _apply),
        ],
      ),
    );
  }

  Widget _tile(String code, String name, String native) {
    final sel = _sel == code;
    return GestureDetector(
      onTap: () => setState(() => _sel = code),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: sel ? Ob.selectedFill : Ob.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: sel ? Ob.selectedBorder : Ob.border, width: sel ? 1.6 : 1),
          boxShadow: sel ? null : Ob.softShadow,
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: const BoxDecoration(color: Ob.lavenderChip, shape: BoxShape.circle),
              child: Text(native.substring(0, 1),
                  style: Ob.option.copyWith(color: Ob.purple, fontSize: 17)),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: Ob.option),
                  Text(native, style: Ob.note),
                ],
              ),
            ),
            if (sel) const GoldCheck(size: 24) else const Icon(Icons.circle_outlined, color: Color(0xFFCFC8E0)),
          ],
        ),
      ),
    );
  }
}
