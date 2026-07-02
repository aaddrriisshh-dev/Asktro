import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';

/// First-run profile collection for a new customer. A friendly "free welcome
/// chat" hook, then a six-step wizard that gathers the birth details an
/// astrologer needs (name, gender, date/time/place of birth, languages).
///
/// Rendered by the home gate whenever the signed-in user's profile has
/// `onboardingComplete == false`. On finish it writes the details to the
/// user's Firestore profile and flips `onboardingComplete`, at which point the
/// gate swaps in the real home. Money fields are never touched here.
class ProfileSetupScreen extends ConsumerStatefulWidget {
  const ProfileSetupScreen({super.key, this.initialName});
  final String? initialName;

  @override
  ConsumerState<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends ConsumerState<ProfileSetupScreen> {
  // -1 = welcome hook, 0..5 = the six detail steps.
  int _step = -1;
  bool _saving = false;

  // Collected values.
  late final TextEditingController _name =
      TextEditingController(text: widget.initialName ?? '');
  String? _gender;
  DateTime _birthDate = DateTime(2000, 1, 1);
  int _hour = 12; // 1..12
  int _minute = 0; // 0..59
  bool _pm = false;
  bool _timeUnknown = false;
  String? _birthPlace;
  final Set<String> _languages = {};

  static const _totalSteps = 6;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _back() {
    if (_step <= -1) return;
    setState(() => _step -= 1);
  }

  void _next() {
    if (_step < _totalSteps - 1) {
      setState(() => _step += 1);
    } else {
      _finish();
    }
  }

  bool get _canProceed {
    switch (_step) {
      case 0:
        return _name.text.trim().isNotEmpty;
      case 1:
        return _gender != null;
      case 4:
        return _birthPlace != null && _birthPlace!.trim().isNotEmpty;
      case 5:
        return _languages.isNotEmpty;
      default:
        return true; // date / time always have a default
    }
  }

  String get _birthTime24 {
    var h = _hour % 12;
    if (_pm) h += 12;
    return '${h.toString().padLeft(2, '0')}:${_minute.toString().padLeft(2, '0')}';
  }

  Future<void> _finish() async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    setState(() => _saving = true);
    final patch = <String, dynamic>{
      'name': _name.text.trim(),
      'gender': _gender,
      'birthDateMs': _birthDate.millisecondsSinceEpoch,
      'birthTimeKnown': !_timeUnknown,
      'birthTime': _timeUnknown ? null : _birthTime24,
      'birthPlace': _birthPlace,
      'languages': _languages.toList(),
      'onboardingComplete': true,
    };
    try {
      await ref.read(userRepositoryProvider).updateProfile(uid, patch);
      ref.read(analyticsProvider).logEvent('profile_setup_complete');
    } catch (_) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Could not save your details. Please try again.'),
        ));
      }
      return;
    }
    // No navigation needed: the profile stream flips onboardingComplete and the
    // home gate rebuilds into the real home.
  }

  Future<void> _skip() async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    setState(() => _saving = true);
    await ref.read(userRepositoryProvider).updateProfile(uid, {
      if (_name.text.trim().isNotEmpty) 'name': _name.text.trim(),
      'onboardingComplete': true,
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 260),
          transitionBuilder: (child, anim) => FadeTransition(
            opacity: anim,
            child: SlideTransition(
              position: Tween(begin: const Offset(0.06, 0), end: Offset.zero)
                  .animate(anim),
              child: child,
            ),
          ),
          child: _step == -1
              ? _welcome()
              : KeyedSubtree(key: ValueKey(_step), child: _wizard()),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- welcome --
  Widget _welcome() {
    return Padding(
      key: const ValueKey('welcome'),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
      child: Column(
        children: [
          const Spacer(),
          Container(
            width: 168,
            height: 168,
            decoration: const BoxDecoration(
              gradient: AppColors.lavenderGradient,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.auto_awesome_rounded,
                size: 78, color: AppColors.primary),
          ),
          const SizedBox(height: AppSpacing.xxl),
          Container(
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.accentLavender,
              borderRadius: BorderRadius.circular(AppRadius.chip),
            ),
            child: Text('WELCOME GIFT',
                style: AppTypography.caption.copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2)),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text('Your first chat is on us',
              style: AppTypography.headline, textAlign: TextAlign.center),
          const SizedBox(height: AppSpacing.md),
          Text(
            'Tell us a little about yourself and start a free chat with a '
            'trusted astrologer to see how ASKTRO can guide you.',
            style: AppTypography.body.copyWith(color: AppColors.textSecondary),
            textAlign: TextAlign.center,
          ),
          const Spacer(),
          PrimaryButton(
            label: 'Start Free Chat',
            icon: Icons.chat_bubble_rounded,
            loading: _saving,
            onPressed: _saving ? null : () => setState(() => _step = 0),
          ),
          TextButton(
            onPressed: _saving ? null : _skip,
            child: Text('Explore first',
                style: AppTypography.body
                    .copyWith(color: AppColors.textSecondary)),
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
      ),
    );
  }

  // ----------------------------------------------------------------- wizard --
  Widget _wizard() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Top bar: back + step progress.
        Padding(
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.sm, AppSpacing.sm, AppSpacing.lg, 0),
          child: Row(
            children: [
              IconButton(
                onPressed: _saving ? null : _back,
                icon: const Icon(Icons.arrow_back_rounded,
                    color: AppColors.textDark),
              ),
              Expanded(child: _progress()),
              const SizedBox(width: 48),
            ],
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(
                AppSpacing.xl, AppSpacing.lg, AppSpacing.xl, AppSpacing.lg),
            child: _stepBody(),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.xl, 0, AppSpacing.xl, AppSpacing.lg),
          child: PrimaryButton(
            label: _step == _totalSteps - 1 ? 'Start chat with Astrologer' : 'Continue',
            loading: _saving,
            onPressed: (_canProceed && !_saving) ? _next : null,
          ),
        ),
      ],
    );
  }

  Widget _progress() {
    return Row(
      children: List.generate(_totalSteps, (i) {
        final done = i <= _step;
        return Expanded(
          child: AnimatedContainer(
            duration: AppSizes.tapAnim,
            height: 6,
            margin: const EdgeInsets.symmetric(horizontal: 3),
            decoration: BoxDecoration(
              color: done ? AppColors.primary : AppColors.secondary.withValues(alpha: 0.28),
              borderRadius: BorderRadius.circular(3),
            ),
          ),
        );
      }),
    );
  }

  Widget _stepBody() {
    switch (_step) {
      case 0:
        return _nameStep();
      case 1:
        return _genderStep();
      case 2:
        return _dateStep();
      case 3:
        return _timeStep();
      case 4:
        return _placeStep();
      case 5:
        return _languageStep();
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _heading(String title, [String? subtitle]) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: AppTypography.title),
        if (subtitle != null) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(subtitle,
              style: AppTypography.body.copyWith(color: AppColors.textSecondary)),
        ],
        const SizedBox(height: AppSpacing.xl),
      ],
    );
  }

  // Step 1 — name
  Widget _nameStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _heading('Hey there! What should we call you?',
            'This is how astrologers will greet you.'),
        TextField(
          controller: _name,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          textInputAction: TextInputAction.done,
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) {
            if (_canProceed) _next();
          },
          decoration: const InputDecoration(
            hintText: 'Your name',
            prefixIcon: Icon(Icons.person_outline_rounded),
          ),
        ),
      ],
    );
  }

  // Step 2 — gender
  Widget _genderStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _heading('Which gender do you identify with?'),
        Row(
          children: [
            Expanded(child: _genderCard('male', Icons.male_rounded, 'Male')),
            const SizedBox(width: AppSpacing.md),
            Expanded(child: _genderCard('female', Icons.female_rounded, 'Female')),
          ],
        ),
      ],
    );
  }

  Widget _genderCard(String value, IconData icon, String label) {
    final selected = _gender == value;
    return GestureDetector(
      onTap: () => setState(() => _gender = value),
      child: AnimatedContainer(
        duration: AppSizes.tapAnim,
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
        decoration: BoxDecoration(
          color: selected ? AppColors.accentLavender : AppColors.card,
          borderRadius: BorderRadius.circular(AppRadius.card),
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.border,
            width: selected ? 1.6 : 1,
          ),
          boxShadow: selected ? null : AppShadows.soft,
        ),
        child: Column(
          children: [
            Icon(icon,
                size: 44,
                color: selected ? AppColors.primary : AppColors.textSecondary),
            const SizedBox(height: AppSpacing.sm),
            Text(label,
                style: AppTypography.subtitle.copyWith(
                    color: selected ? AppColors.primary : AppColors.textDark)),
          ],
        ),
      ),
    );
  }

  // Step 3 — date of birth
  Widget _dateStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _heading('When were you born?',
            'Your date of birth anchors every prediction.'),
        _wheelCard(
          child: SizedBox(
            height: 200,
            child: CupertinoDatePicker(
              mode: CupertinoDatePickerMode.date,
              initialDateTime: _birthDate,
              minimumDate: DateTime(1920, 1, 1),
              maximumDate: DateTime.now(),
              onDateTimeChanged: (d) => _birthDate = d,
            ),
          ),
        ),
      ],
    );
  }

  // Step 4 — time of birth
  Widget _timeStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _heading('What time were you born?',
            'The birth time sharpens the reading — but it is optional.'),
        Opacity(
          opacity: _timeUnknown ? 0.4 : 1,
          child: IgnorePointer(
            ignoring: _timeUnknown,
            child: _wheelCard(
              child: SizedBox(
                height: 190,
                child: Row(
                  children: [
                    Expanded(
                      child: _wheel(
                        count: 12,
                        selected: _hour - 1,
                        label: (i) => '${i + 1}',
                        onChanged: (i) => _hour = i + 1,
                      ),
                    ),
                    Text(':', style: AppTypography.title),
                    Expanded(
                      child: _wheel(
                        count: 60,
                        selected: _minute,
                        label: (i) => i.toString().padLeft(2, '0'),
                        onChanged: (i) => _minute = i,
                      ),
                    ),
                    Expanded(
                      child: _wheel(
                        count: 2,
                        selected: _pm ? 1 : 0,
                        label: (i) => i == 0 ? 'AM' : 'PM',
                        onChanged: (i) => _pm = i == 1,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        _checkTile(
          value: _timeUnknown,
          label: "I don't know my exact time of birth",
          onChanged: (v) => setState(() => _timeUnknown = v),
        ),
        if (_timeUnknown)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.md),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.info_outline_rounded,
                    size: 18, color: AppColors.primary),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    'No problem — even without a birth time we can still reach up '
                    'to 80% accuracy in your predictions.',
                    style: AppTypography.caption,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  // Step 5 — place of birth
  Widget _placeStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _heading('Where were you born?',
            'City and country of birth.'),
        _CitySearchField(
          initial: _birthPlace,
          onSelected: (city) => setState(() => _birthPlace = city),
        ),
      ],
    );
  }

  // Step 6 — languages
  Widget _languageStep() {
    const languages = [
      'English', 'Hindi', 'Bengali', 'Gujarati', 'Kannada', 'Malayalam',
      'Marathi', 'Punjabi', 'Tamil', 'Telugu', 'Urdu',
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _heading('Which languages do you prefer?',
            'Pick one or more — we will match you with astrologers who speak them.'),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: languages.map((l) {
            final selected = _languages.contains(l);
            return GestureDetector(
              onTap: () => setState(() {
                if (selected) {
                  _languages.remove(l);
                } else {
                  _languages.add(l);
                }
              }),
              child: AnimatedContainer(
                duration: AppSizes.tapAnim,
                padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.lg, vertical: AppSpacing.md),
                decoration: BoxDecoration(
                  color: selected ? AppColors.primary : AppColors.card,
                  borderRadius: BorderRadius.circular(AppRadius.chip),
                  border: Border.all(
                    color: selected ? AppColors.primary : AppColors.border,
                  ),
                  boxShadow: selected ? null : AppShadows.soft,
                ),
                child: Text(
                  l,
                  style: AppTypography.body.copyWith(
                    color: selected ? Colors.white : AppColors.textDark,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  // --------------------------------------------------------------- helpers --
  Widget _wheelCard({required Widget child}) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      decoration: softCardDecoration(),
      child: child,
    );
  }

  Widget _wheel({
    required int count,
    required int selected,
    required String Function(int) label,
    required ValueChanged<int> onChanged,
  }) {
    return CupertinoPicker(
      itemExtent: 40,
      scrollController: FixedExtentScrollController(initialItem: selected),
      selectionOverlay: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4),
        decoration: BoxDecoration(
          color: AppColors.accentLavender.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(10),
        ),
      ),
      onSelectedItemChanged: onChanged,
      children: List.generate(
        count,
        (i) => Center(child: Text(label(i), style: AppTypography.subtitle)),
      ),
    );
  }

  Widget _checkTile({
    required bool value,
    required String label,
    required ValueChanged<bool> onChanged,
  }) {
    return GestureDetector(
      onTap: () => onChanged(!value),
      child: Row(
        children: [
          AnimatedContainer(
            duration: AppSizes.tapAnim,
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: value ? AppColors.primary : AppColors.card,
              borderRadius: BorderRadius.circular(7),
              border: Border.all(
                color: value ? AppColors.primary : AppColors.border,
                width: 1.4,
              ),
            ),
            child: value
                ? const Icon(Icons.check_rounded, size: 16, color: Colors.white)
                : null,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(child: Text(label, style: AppTypography.body)),
        ],
      ),
    );
  }
}

/// A simple typeahead over a static list of common Indian cities. No network
/// dependency — good enough for onboarding and easy to swap for a Places API
/// later.
class _CitySearchField extends StatefulWidget {
  const _CitySearchField({this.initial, required this.onSelected});
  final String? initial;
  final ValueChanged<String> onSelected;

  @override
  State<_CitySearchField> createState() => _CitySearchFieldState();
}

class _CitySearchFieldState extends State<_CitySearchField> {
  late final TextEditingController _c =
      TextEditingController(text: widget.initial ?? '');
  String _query = '';

  static const _cities = [
    'Mumbai, India', 'Delhi, India', 'Bengaluru, India', 'Hyderabad, India',
    'Ahmedabad, India', 'Chennai, India', 'Kolkata, India', 'Pune, India',
    'Jaipur, India', 'Lucknow, India', 'Kanpur, India', 'Nagpur, India',
    'Indore, India', 'Bhopal, India', 'Patna, India', 'Chandigarh, India',
    'Surat, India', 'Vadodara, India', 'Coimbatore, India', 'Kochi, India',
    'Visakhapatnam, India', 'Guwahati, India', 'Bhubaneswar, India',
    'Varanasi, India', 'Amritsar, India', 'Ranchi, India', 'Raipur, India',
    'Dehradun, India', 'Jammu, India', 'Srinagar, India',
  ];

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  List<String> get _matches {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return const [];
    return _cities
        .where((c) => c.toLowerCase().contains(q))
        .take(6)
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final matches = _matches;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: _c,
          autofocus: true,
          onChanged: (v) {
            setState(() => _query = v);
            widget.onSelected(v); // allow free-text too
          },
          decoration: const InputDecoration(
            hintText: 'Search your city',
            prefixIcon: Icon(Icons.location_on_outlined),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        ...matches.map((city) => ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.place_outlined,
                  color: AppColors.textSecondary),
              title: Text(city, style: AppTypography.body),
              onTap: () {
                _c.text = city;
                _c.selection =
                    TextSelection.collapsed(offset: city.length);
                setState(() => _query = '');
                widget.onSelected(city);
                FocusScope.of(context).unfocus();
              },
            )),
      ],
    );
  }
}
