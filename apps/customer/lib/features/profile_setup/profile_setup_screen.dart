import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/router.dart';
import '../../data/place_search_service.dart';
import 'onboarding_style.dart';
import 'onboarding_widgets.dart';

/// First-run onboarding for a new customer, in the celestial navy/gold ASKTRO
/// design: a "Congratulations — free chat unlocked" hook, then a seven-step
/// wizard (name → gender → birth date → birth time → place → relationship →
/// languages) that writes the astrology profile to Firestore and flips
/// `onboardingComplete`, after which the home gate swaps in the real home.
class ProfileSetupScreen extends ConsumerStatefulWidget {
  const ProfileSetupScreen({super.key, this.initialName});
  final String? initialName;

  @override
  ConsumerState<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends ConsumerState<ProfileSetupScreen> {
  static const _totalSteps = 7;

  int _step = -1; // -1 = congrats hook, 0..6 = steps
  bool _saving = false;

  late final TextEditingController _name =
      TextEditingController(text: widget.initialName ?? '');
  final TextEditingController _referral = TextEditingController();
  String? _gender;
  DateTime _birthDate = DateTime(1995, 6, 15);
  int _hour = 10;
  int _minute = 30;
  bool _pm = true;
  bool _timeUnknown = false;
  String? _birthPlace;
  double? _birthLat;
  double? _birthLng;
  String? _relationship;
  final Set<String> _languages = {};

  static const _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  @override
  void dispose() {
    _name.dispose();
    _referral.dispose();
    super.dispose();
  }

  void _advance() {
    if (_step < _totalSteps - 1) {
      FocusScope.of(context).unfocus();
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
        return _relationship != null;
      case 6:
        return _languages.isNotEmpty;
      default:
        return true;
    }
  }

  String get _birthTime24 {
    var h = _hour % 12;
    if (_pm) h += 12;
    return '${h.toString().padLeft(2, '0')}:${_minute.toString().padLeft(2, '0')}';
  }

  Future<void> _finish() async {
    await _completeSetup({
      'name': _name.text.trim(),
      'gender': _gender,
      'birthDateMs': _birthDate.millisecondsSinceEpoch,
      'birthTimeKnown': !_timeUnknown,
      'birthTime': _timeUnknown ? null : _birthTime24,
      'birthPlace': _birthPlace,
      'birthLat': _birthLat,
      'birthLng': _birthLng,
      'relationshipStatus': _relationship,
      'languages': _languages.toList(),
      if (_referral.text.trim().isNotEmpty) 'referredBy': _referral.text.trim().toUpperCase(),
      'onboardingComplete': true,
    });
  }

  Future<void> _skip() async {
    await _completeSetup({
      if (_name.text.trim().isNotEmpty) 'name': _name.text.trim(),
      'onboardingComplete': true,
    });
  }

  /// Setup runs before login, so there's usually no uid yet: buffer the details
  /// and move to login (they're written to Firestore right after sign-in by the
  /// home gate). If a user is already signed in (e.g. editing later), save now.
  Future<void> _completeSetup(Map<String, dynamic> data) async {
    setState(() => _saving = true);
    // ALWAYS buffer the details in memory AND on disk, whether or not a uid
    // already exists. Setup normally runs before login (no uid), but a persisted
    // Firebase session can leave a STALE uid here — if we only wrote to that uid
    // and skipped the buffer, the details would never reach the account the user
    // actually logs into next, and they'd land as a nameless "Guest". Buffering
    // unconditionally means the home-gate backstop can always recover them.
    ref.read(pendingProfileProvider.notifier).state = data;
    await writePendingProfile(data);
    final uid = ref.read(currentUidProvider);
    if (uid != null) {
      try {
        await ref.read(userRepositoryProvider).applyOnboarding(uid, data);
        ref.read(analyticsProvider).logEvent('profile_setup_complete');
      } catch (_) {
        // Non-fatal: the buffer is on disk and the home-gate backstop retries.
      }
    }
    await setSetupDone();
    ref.read(setupDoneProvider.notifier).state = true;
    if (!mounted) return;
    context.go(uid != null ? '/home' : '/login');
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 250),
      transitionBuilder: (child, anim) => FadeTransition(
        opacity: anim,
        child: SlideTransition(
          position: Tween(begin: const Offset(0.05, 0), end: Offset.zero).animate(anim),
          child: child,
        ),
      ),
      child: KeyedSubtree(key: ValueKey(_step), child: _current()),
    );
  }

  Widget _current() {
    switch (_step) {
      case -1:
        return _congrats();
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
        return _relationshipStep();
      case 6:
        return _languageStep();
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _footer(String label, {IconData? icon = Icons.arrow_forward_rounded}) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GoldButton(
          label: label,
          icon: icon,
          loading: _saving,
          onPressed: (_canProceed && !_saving) ? _advance : null,
        ),
        const SizedBox(height: 12),
        const SecureFooter(),
      ],
    );
  }

  Widget _stepHead(String title, String subtitle, {String? accent}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Constrain the heading so long titles wrap on the left and never run
        // under the upper-right illustration.
        SizedBox(width: 250, child: obTitle(title, accent: accent)),
        const SizedBox(height: 12),
        const SparkleDivider(),
        // Subtitle is optional — an empty string collapses it so the step stays
        // compact and fits the viewport without scrolling.
        if (subtitle.isNotEmpty) ...[
          const SizedBox(height: 12),
          SizedBox(width: 240, child: Text(subtitle, style: Ob.subtitle)),
        ],
      ],
    );
  }

  // ------------------------------------------------------------- congrats --
  Widget _congrats() {
    return OnboardingScaffold(
      stepIndex: null,
      showExploreMore: true,
      onExploreMore: _saving ? null : _skip,
      content: Column(
        children: [
          const SizedBox(height: 4),
          _giftHero(),
          const SizedBox(height: 18),
          Text('Congratulations!', style: Ob.display, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          RichText(
            textAlign: TextAlign.center,
            text: TextSpan(
              style: Ob.subtitle.copyWith(fontSize: 16, color: Ob.navy),
              children: const [
                TextSpan(text: "You've unlocked your "),
                TextSpan(
                    text: 'Free Chat',
                    style: TextStyle(color: Ob.goldDeep, fontWeight: FontWeight.w600),),
                TextSpan(text: ' with an Astrologer  ✦'),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Center(child: SparkleDivider()),
          const SizedBox(height: 16),
          Text(
            'Our expert will guide you with clarity,\ninsights and personalized solutions.',
            style: Ob.subtitle,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 22),
          _featureGrid(),
        ],
      ),
      footer: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          GoldButton(
            label: 'Start Free Chat',
            loading: _saving,
            onPressed: _saving ? null : () => setState(() => _step = 0),
          ),
          const SizedBox(height: 12),
          const SecureFooter(),
        ],
      ),
    );
  }

  Widget _giftHero() {
    return SizedBox(
      height: 220,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Image.asset(Ob.gift, height: 220),
          _bubble(const Offset(-122, -66), Icons.chat_bubble_rounded),
          _bubble(const Offset(122, -70), Icons.star_rounded),
          _bubble(const Offset(-128, 58), Icons.favorite_rounded),
          _bubble(const Offset(126, 56), Icons.calendar_today_rounded),
        ],
      ),
    );
  }

  Widget _bubble(Offset offset, IconData icon) {
    return Transform.translate(
      offset: offset,
      child: Container(
        width: 50,
        height: 50,
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          boxShadow: Ob.softShadow,
        ),
        child: Icon(icon, color: Ob.purple, size: 23),
      ),
    );
  }

  Widget _featureGrid() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.8),
        borderRadius: BorderRadius.circular(Ob.cardRadius),
        boxShadow: Ob.softShadow,
      ),
      child: Row(
        children: [
          _feature(Icons.chat_bubble_outline_rounded, 'Free 1st Chat', 'Answers in real-time.'),
          _feature(Icons.shield_outlined, '100% Private', 'Safe & confidential.'),
          _feature(Icons.workspace_premium_outlined, 'Verified Experts', 'Trusted astrologers.'),
          _feature(Icons.access_time_rounded, 'Quick & Easy', 'Guidance anytime.'),
        ],
      ),
    );
  }

  Widget _feature(IconData icon, String title, String desc) {
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Column(
          children: [
            Icon(icon, color: Ob.purple, size: 26),
            const SizedBox(height: 8),
            Text(title,
                style: Ob.note.copyWith(color: Ob.navy, fontWeight: FontWeight.w600),
                textAlign: TextAlign.center,),
            const SizedBox(height: 4),
            Text(desc, style: Ob.note.copyWith(fontSize: 11), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }

  // ----------------------------------------------------------- step: name --
  Widget _nameStep() {
    return OnboardingScaffold(
      stepIndex: 0,
      stepIcon: Icons.person_outline_rounded,
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 18),
          Text('Hey there!', style: Ob.hero),
          const SizedBox(height: 6),
          Text('What is your name?', style: Ob.subtitleLg),
          const SizedBox(height: 14),
          const SparkleDivider(),
          const SizedBox(height: 28),
          _textField(
            controller: _name,
            hint: 'Enter your name',
            icon: Icons.person_outline_rounded,
            onSubmit: () {
              if (_canProceed) _advance();
            },
          ),
        ],
      ),
      footer: _footer('Next'),
    );
  }

  // --------------------------------------------------------- step: gender --
  Widget _genderStep() {
    return OnboardingScaffold(
      stepIndex: 1,
      stepIcon: Icons.person_rounded,
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 8),
          _stepHead('What is your gender?', ''),
          const SizedBox(height: 22),
          Row(
            children: [
              Expanded(child: _genderCard('male', Icons.man, 'Male', Ob.gold)),
              const SizedBox(width: 16),
              Expanded(child: _genderCard('female', Icons.woman, 'Female', Ob.purple)),
            ],
          ),
        ],
      ),
      footer: _footer('Next'),
    );
  }

  Widget _genderCard(String value, IconData icon, String label, Color accent) {
    final selected = _gender == value;
    return GestureDetector(
      onTap: () => setState(() => _gender = value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        height: 196,
        decoration: BoxDecoration(
          color: selected ? Ob.selectedFill : Ob.surface,
          borderRadius: BorderRadius.circular(26),
          border: Border.all(
            color: selected ? Ob.selectedBorder : Ob.border,
            width: selected ? 1.8 : 1,
          ),
          boxShadow: selected ? null : Ob.softShadow,
        ),
        child: Stack(
          children: [
            if (selected) const Positioned(top: 12, right: 12, child: GoldCheck(size: 26)),
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 112,
                    height: 112,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        // outer celestial ring
                        Container(
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(color: accent.withValues(alpha: 0.35), width: 1.4),
                          ),
                        ),
                        // inner filled disc
                        Container(
                          width: 90,
                          height: 90,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: accent.withValues(alpha: 0.12),
                          ),
                        ),
                        Icon(icon, color: accent, size: 54),
                        Positioned(
                          top: 8,
                          right: 12,
                          child: Icon(Icons.auto_awesome,
                              color: accent.withValues(alpha: 0.7), size: 12,),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(label, style: Ob.optionLabel),
                  const SizedBox(height: 8),
                  Container(
                    width: 28,
                    height: 3,
                    decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(2)),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ----------------------------------------------------------- step: date --
  Widget _dateStep() {
    return OnboardingScaffold(
      stepIndex: 2,
      stepIcon: Icons.calendar_today_rounded,
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 8),
          _stepHead('Enter your birth date', 'For your personalised horoscope.'),
          const SizedBox(height: 22),
          _wheelCard(
            topLabels: const ['Month', 'Day', 'Year'],
            topIcon: Icons.calendar_today_rounded,
            columns: [
              _WheelSpec(count: 12, initial: _birthDate.month - 1, label: (i) => _months[i], onChanged: (i) => _syncDate(month: i + 1)),
              _WheelSpec(count: 31, initial: _birthDate.day - 1, label: (i) => '${i + 1}', onChanged: (i) => _syncDate(day: i + 1)),
              _WheelSpec(count: 2010 - 1920 + 1, initial: _birthDate.year - 1920, label: (i) => '${1920 + i}', onChanged: (i) => _syncDate(year: 1920 + i)),
            ],
          ),
        ],
      ),
      footer: _footer('Next'),
    );
  }

  void _syncDate({int? year, int? month, int? day}) {
    final y = year ?? _birthDate.year;
    final m = month ?? _birthDate.month;
    final d = day ?? _birthDate.day;
    final lastDay = DateTime(y, m + 1, 0).day;
    _birthDate = DateTime(y, m, d > lastDay ? lastDay : d);
  }

  // ----------------------------------------------------------- step: time --
  Widget _timeStep() {
    return OnboardingScaffold(
      stepIndex: 3,
      stepIcon: Icons.access_time_rounded,
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 8),
          _stepHead('Enter your birth time', ''),
          const SizedBox(height: 22),
          Opacity(
            opacity: _timeUnknown ? 0.45 : 1,
            child: IgnorePointer(
              ignoring: _timeUnknown,
              child: _wheelCard(
                colons: true,
                headerIcon: Icons.access_time_rounded,
                headerLabel: 'Enter your birth time',
                bottomLabels: const ['Hour', 'Minute', 'AM / PM'],
                columns: [
                  _WheelSpec(count: 12, initial: _hour - 1, label: (i) => (i + 1).toString().padLeft(2, '0'), onChanged: (i) => _hour = i + 1),
                  _WheelSpec(count: 60, initial: _minute, label: (i) => i.toString().padLeft(2, '0'), onChanged: (i) => _minute = i),
                  _WheelSpec(count: 2, initial: _pm ? 1 : 0, label: (i) => i == 0 ? 'AM' : 'PM', onChanged: (i) => _pm = i == 1),
                ],
              ),
            ),
          ),
          const SizedBox(height: 18),
          _unknownTimeCard(),
        ],
      ),
      footer: _footer('Next'),
    );
  }

  Widget _unknownTimeCard() {
    return GestureDetector(
      onTap: () => setState(() => _timeUnknown = !_timeUnknown),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: Ob.lavender, borderRadius: BorderRadius.circular(18)),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 140),
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                color: _timeUnknown ? Ob.gold : Colors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: _timeUnknown ? Ob.gold : const Color(0xFFCFC8E0), width: 1.5),
              ),
              child: _timeUnknown ? const Icon(Icons.check_rounded, size: 17, color: Colors.white) : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text("I don't know my exact time of birth", style: Ob.noteTitle),
                  const SizedBox(height: 2),
                  Text('No worries! We can still generate up to 80% accurate predictions without birth time.', style: Ob.note),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ---------------------------------------------------------- step: place --
  Widget _placeStep() {
    return OnboardingScaffold(
      stepIndex: 4,
      stepIcon: Icons.location_on_outlined,
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 8),
          _stepHead('Where were you born?', ''),
          const SizedBox(height: 18),
          _CitySearchField(
            initial: _birthPlace,
            onSelected: (p) => setState(() {
              _birthPlace = p.label;
              _birthLat = p.lat;
              _birthLng = p.lon;
            }),
          ),
        ],
      ),
      footer: _footer('Next'),
    );
  }

  // --------------------------------------------------- step: relationship --
  Widget _relationshipStep() {
    return OnboardingScaffold(
      stepIndex: 5,
      stepIcon: Icons.favorite_border_rounded,
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 8),
          _stepHead('Your relationship status', '', accent: 'relationship'),
          const SizedBox(height: 20),
          OptionRow(icon: Icons.person_rounded, iconBg: Ob.lavenderChip, iconColor: Ob.purple, label: 'Single', selected: _relationship == 'single', onTap: () => setState(() => _relationship = 'single')),
          const SizedBox(height: 12),
          OptionRow(icon: Icons.favorite_rounded, iconBg: const Color(0xFFFBE0E0), iconColor: const Color(0xFFD86C6C), label: 'In a Relationship', selected: _relationship == 'in_relationship', onTap: () => setState(() => _relationship = 'in_relationship')),
          const SizedBox(height: 12),
          OptionRow(icon: Icons.favorite_rounded, iconBg: const Color(0xFFFBEECB), iconColor: const Color(0xFFCFA232), label: 'Married', selected: _relationship == 'married', onTap: () => setState(() => _relationship = 'married')),
        ],
      ),
      footer: _footer('Next'),
    );
  }

  // ------------------------------------------------------- step: languages --
  Widget _languageStep() {
    // v1 ships English + Hindi (the fuller multi-language experience lands in a
    // later build). Show just these two so onboarding matches what the app offers.
    const langs = <List<String>>[
      ['English', 'A'], ['Hindi', 'अ'],
    ];
    return OnboardingScaffold(
      stepIndex: 6,
      stepIcon: Icons.translate_rounded,
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 8),
          _stepHead('Your languages', ''),
          const SizedBox(height: 18),
          LayoutBuilder(builder: (context, c) {
            const spacing = 10.0;
            final w = (c.maxWidth - spacing) / 2;
            return Wrap(
              spacing: spacing,
              runSpacing: spacing,
              children: [for (final l in langs) SizedBox(width: w, child: _languageTile(l[0], l[1]))],
            );
          },),
        ],
      ),
      footer: _footer('Start chat with Astrologer'),
    );
  }

  Widget _languageTile(String label, String glyph) {
    final selected = _languages.contains(label);
    return GestureDetector(
      onTap: () => setState(() {
        if (selected) {
          _languages.remove(label);
        } else {
          _languages.add(label);
        }
      }),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
        decoration: BoxDecoration(
          color: selected ? Ob.selectedFill : Ob.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: selected ? Ob.selectedBorder : Ob.border, width: selected ? 1.6 : 1),
          boxShadow: selected ? null : Ob.softShadow,
        ),
        child: Row(
          children: [
            Container(
              width: 30,
              height: 30,
              decoration: const BoxDecoration(color: Ob.lavenderChip, shape: BoxShape.circle),
              alignment: Alignment.center,
              child: Text(glyph, style: Ob.option.copyWith(color: Ob.purple, fontSize: 15)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(label,
                  style: Ob.option.copyWith(fontSize: 13.5),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,),
            ),
            selected
                ? const GoldCheck(size: 20)
                : const Icon(Icons.add_rounded, color: Ob.purple, size: 18),
          ],
        ),
      ),
    );
  }

  // --------------------------------------------------------------- shared --
  Widget _textField({
    required TextEditingController controller,
    required String hint,
    required IconData icon,
    VoidCallback? onSubmit,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(Ob.inputRadius),
        boxShadow: Ob.softShadow,
      ),
      child: TextField(
        controller: controller,
        autofocus: true,
        textCapitalization: TextCapitalization.words,
        textInputAction: TextInputAction.done,
        style: Ob.option,
        cursorColor: Ob.purple,
        onChanged: (_) => setState(() {}),
        onSubmitted: (_) => onSubmit?.call(),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: Ob.option.copyWith(color: const Color(0xFF9E98B0)),
          prefixIcon: Icon(icon, color: Ob.purple),
          filled: false,
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(vertical: 20, horizontal: 6),
        ),
      ),
    );
  }

  Widget _wheelCard({
    required List<_WheelSpec> columns,
    List<String>? topLabels,
    IconData? topIcon,
    List<String>? bottomLabels,
    IconData? headerIcon,
    String? headerLabel,
    bool colons = false,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(Ob.cardRadius),
        boxShadow: Ob.softShadow,
      ),
      child: Column(
        children: [
          if (headerLabel != null) ...[
            Row(
              children: [
                if (headerIcon != null) ...[
                  Container(
                    width: 34,
                    height: 34,
                    decoration: const BoxDecoration(color: Ob.lavenderChip, shape: BoxShape.circle),
                    child: Icon(headerIcon, color: Ob.purple, size: 18),
                  ),
                  const SizedBox(width: 10),
                ],
                Text(headerLabel, style: Ob.sectionLabel),
              ],
            ),
            const SizedBox(height: 6),
          ],
          if (topLabels != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                children: [
                  for (final t in topLabels)
                    Expanded(
                      child: Column(
                        children: [
                          Icon(topIcon, color: Ob.purple, size: 16),
                          const SizedBox(height: 4),
                          Text(t, style: Ob.note.copyWith(color: Ob.navy, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          _wheelRow(columns, colons: colons),
          if (bottomLabels != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Row(
                children: [
                  for (final t in bottomLabels)
                    Expanded(child: Text(t, textAlign: TextAlign.center, style: Ob.note.copyWith(fontWeight: FontWeight.w600))),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _wheelRow(List<_WheelSpec> columns, {bool colons = false}) {
    return SizedBox(
      height: 200,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Center(
            child: Container(
              height: 46,
              margin: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(
                color: Ob.lavenderChip.withValues(alpha: 0.7),
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          Row(
            children: [
              for (var i = 0; i < columns.length; i++) ...[
                if (colons && i > 0)
                  Text(':', style: Ob.wheel.copyWith(color: const Color(0xFFC9C3D8))),
                Expanded(child: _wheel(columns[i])),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _wheel(_WheelSpec spec) {
    return CupertinoPicker(
      itemExtent: 46,
      scrollController: FixedExtentScrollController(initialItem: spec.initial),
      selectionOverlay: const SizedBox.shrink(),
      onSelectedItemChanged: spec.onChanged,
      children: List.generate(spec.count, (i) => Center(child: Text(spec.label(i), style: Ob.wheel))),
    );
  }
}

class _WheelSpec {
  const _WheelSpec({required this.count, required this.initial, required this.label, required this.onChanged});
  final int count;
  final int initial;
  final String Function(int) label;
  final ValueChanged<int> onChanged;
}

/// Birth-place autocomplete backed by a live geocoder (Nominatim, India). As
/// the user types we debounce, query, and list matching towns/cities/villages.
/// No "popular places" — the list is driven entirely by the user's search, so
/// nobody feels excluded and the screen stays uncluttered.
class _CitySearchField extends StatefulWidget {
  const _CitySearchField({this.initial, required this.onSelected});
  final String? initial;
  // Carries the picked place with its lat/lon (free-typed text has null coords).
  final ValueChanged<PlaceResult> onSelected;

  @override
  State<_CitySearchField> createState() => _CitySearchFieldState();
}

class _CitySearchFieldState extends State<_CitySearchField> {
  final _service = PlaceSearchService();
  late final TextEditingController _c = TextEditingController(text: widget.initial ?? '');
  Timer? _debounce;
  bool _loading = false;
  List<PlaceResult> _results = const [];

  @override
  void dispose() {
    _debounce?.cancel();
    _c.dispose();
    super.dispose();
  }

  void _onChanged(String v) {
    widget.onSelected(PlaceResult(label: v)); // free text keeps the CTA usable (no coords)
    setState(() {});
    _debounce?.cancel();
    final q = v.trim();
    if (q.length < 2) {
      setState(() {
        _results = const [];
        _loading = false;
      });
      return;
    }
    setState(() => _loading = true);
    _debounce = Timer(const Duration(milliseconds: 450), () async {
      final r = await _service.search(q);
      if (!mounted || q != _c.text.trim()) return; // drop stale responses
      setState(() {
        _results = r;
        _loading = false;
      });
    });
  }

  void _pick(PlaceResult p) {
    _c.text = p.label;
    _c.selection = TextSelection.collapsed(offset: p.label.length);
    setState(() => _results = const []);
    widget.onSelected(p); // carries lat/lon
    FocusScope.of(context).unfocus();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(Ob.inputRadius),
            boxShadow: Ob.softShadow,
          ),
          child: TextField(
            controller: _c,
            autofocus: true,
            style: Ob.option.copyWith(fontSize: 16),
            cursorColor: Ob.purple,
            onChanged: _onChanged,
            decoration: InputDecoration(
              hintText: 'Search your town, city or village',
              hintStyle: Ob.option.copyWith(color: const Color(0xFF9E98B0), fontSize: 16),
              prefixIcon: const Icon(Icons.location_on_outlined, color: Ob.purple),
              suffixIcon: _loading
                  ? const Padding(
                      padding: EdgeInsets.all(15),
                      child: SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2.2, color: Ob.purple),
                      ),
                    )
                  : const Icon(Icons.search_rounded, color: Ob.purple),
              filled: false,
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(vertical: 18),
            ),
          ),
        ),
        // Suggestions in a CAPPED inline card that lives in the content area,
        // ABOVE the Next button — it never floats over the CTA. At most ~3 show;
        // the rest scroll within the card.
        if (_results.isNotEmpty) ...[
          const SizedBox(height: 10),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 168),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                boxShadow: Ob.softShadow,
              ),
              clipBehavior: Clip.antiAlias,
              child: Material(
                type: MaterialType.transparency,
                child: ListView.separated(
                  padding: EdgeInsets.zero,
                  shrinkWrap: true,
                  physics: const ClampingScrollPhysics(),
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  itemCount: _results.length,
                  separatorBuilder: (_, __) =>
                      const Divider(height: 1, indent: 66, endIndent: 16, color: Ob.border),
                  itemBuilder: (_, i) => _resultTile(_results[i]),
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _resultTile(PlaceResult p) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
      leading: Container(
        width: 40,
        height: 40,
        decoration: const BoxDecoration(color: Ob.lavenderChip, shape: BoxShape.circle),
        child: const Icon(Icons.place_outlined, color: Ob.purple, size: 20),
      ),
      title: Text(p.label, style: Ob.option.copyWith(fontSize: 15)),
      trailing: const Icon(Icons.north_west_rounded, color: Color(0xFFB9B3C9), size: 18),
      onTap: () => _pick(p),
    );
  }
}
