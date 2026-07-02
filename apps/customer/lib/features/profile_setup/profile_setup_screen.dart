import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import 'onboarding_style.dart';
import 'onboarding_widgets.dart';

/// First-run onboarding for a new customer, replicating the ASKTRO navy/gold
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

  // -1 = welcome/congrats hook, 0..6 = the seven detail steps.
  int _step = -1;
  bool _saving = false;

  late final TextEditingController _name =
      TextEditingController(text: widget.initialName ?? '');
  String? _gender;
  DateTime _birthDate = DateTime(1995, 6, 15);
  int _hour = 10; // 1..12
  int _minute = 30; // 0..59
  bool _pm = true;
  bool _timeUnknown = false;
  String? _birthPlace;
  String? _relationship;
  final Set<String> _languages = {};

  static const _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  @override
  void dispose() {
    _name.dispose();
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
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    setState(() => _saving = true);
    try {
      await ref.read(userRepositoryProvider).updateProfile(uid, {
        'name': _name.text.trim(),
        'gender': _gender,
        'birthDateMs': _birthDate.millisecondsSinceEpoch,
        'birthTimeKnown': !_timeUnknown,
        'birthTime': _timeUnknown ? null : _birthTime24,
        'birthPlace': _birthPlace,
        'relationshipStatus': _relationship,
        'languages': _languages.toList(),
        'onboardingComplete': true,
      });
      ref.read(analyticsProvider).logEvent('profile_setup_complete');
    } catch (_) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Could not save your details. Please try again.'),
        ));
      }
    }
    // Success: the profile stream flips onboardingComplete and the home gate
    // rebuilds into the real home; no manual navigation needed.
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
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 280),
      transitionBuilder: (child, anim) => FadeTransition(
        opacity: anim,
        child: SlideTransition(
          position:
              Tween(begin: const Offset(0.05, 0), end: Offset.zero).animate(anim),
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

  // Standard footer: gold CTA + secure line.
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
        const SizedBox(height: 14),
        const SecureFooter(),
      ],
    );
  }

  Widget _stepHead(String title, String subtitle, {String? accent}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        obTitle(title, accent: accent),
        const SizedBox(height: 14),
        const SparkleDivider(),
        const SizedBox(height: 16),
        Text(subtitle, style: Ob.subtitle),
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
          const SizedBox(height: 8),
          _giftHero(),
          const SizedBox(height: 20),
          Text('Congratulations!', style: Ob.display, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          RichText(
            textAlign: TextAlign.center,
            text: TextSpan(
              style: Ob.subtitle.copyWith(fontSize: 16, color: Ob.navy),
              children: [
                const TextSpan(text: "You've unlocked your "),
                TextSpan(
                    text: 'Free Chat',
                    style: TextStyle(color: Ob.goldDeep, fontWeight: FontWeight.w600)),
                const TextSpan(text: ' with an Astrologer  ✦'),
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
          const SizedBox(height: 14),
          const SecureFooter(),
        ],
      ),
    );
  }

  Widget _giftHero() {
    return SizedBox(
      height: 230,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Image.asset(Ob.gift, height: 230),
          _bubble(const Offset(-120, -70), Icons.chat_bubble_rounded),
          _bubble(const Offset(120, -74), Icons.star_rounded),
          _bubble(const Offset(-128, 60), Icons.favorite_rounded),
          _bubble(const Offset(126, 58), Icons.calendar_today_rounded),
        ],
      ),
    );
  }

  Widget _bubble(Offset offset, IconData icon) {
    return Transform.translate(
      offset: offset,
      child: Container(
        width: 52,
        height: 52,
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          boxShadow: Ob.softShadow,
        ),
        child: Icon(icon, color: Ob.purple, size: 24),
      ),
    );
  }

  Widget _featureGrid() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.75),
        borderRadius: BorderRadius.circular(22),
        boxShadow: Ob.softShadow,
      ),
      child: Row(
        children: [
          _feature(Icons.chat_bubble_outline_rounded, 'Free 1st Chat', 'Get answers in real-time.'),
          _feature(Icons.shield_outlined, '100% Private', 'Safe and confidential.'),
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
                textAlign: TextAlign.center),
            const SizedBox(height: 4),
            Text(desc,
                style: Ob.note.copyWith(fontSize: 11),
                textAlign: TextAlign.center),
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
          const SizedBox(height: 30),
          Text('Hey there!', style: Ob.display.copyWith(fontSize: 40)),
          const SizedBox(height: 6),
          Text('What is your name?',
              style: Ob.subtitle.copyWith(fontSize: 20, color: Ob.navySoft)),
          const SizedBox(height: 16),
          const SparkleDivider(),
          const SizedBox(height: 40),
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
          const SizedBox(height: 10),
          _stepHead('What is your gender?',
              'This helps us personalize your experience.'),
          const SizedBox(height: 34),
          Row(
            children: [
              Expanded(
                  child: _genderCard('male', Icons.man_rounded, 'Male', Ob.gold)),
              const SizedBox(width: 16),
              Expanded(
                  child: _genderCard('female', Icons.woman_rounded, 'Female', Ob.purple)),
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
        height: 230,
        decoration: BoxDecoration(
          color: selected ? Ob.selectedFill : Ob.card,
          borderRadius: BorderRadius.circular(26),
          border: Border.all(
            color: selected ? Ob.selectedBorder : Ob.line,
            width: selected ? 1.8 : 1,
          ),
          boxShadow: selected ? null : Ob.softShadow,
        ),
        child: Stack(
          children: [
            if (selected)
              const Positioned(top: 12, right: 12, child: GoldCheck(size: 26)),
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 116,
                  height: 116,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: accent.withValues(alpha: 0.12),
                    border: Border.all(color: accent.withValues(alpha: 0.4), width: 1.4),
                  ),
                  child: Icon(icon, color: accent, size: 60),
                ),
                const SizedBox(height: 18),
                Text(label,
                    style: Ob.title.copyWith(fontSize: 22, color: Ob.navy)),
                const SizedBox(height: 6),
                Container(width: 26, height: 3, color: accent),
              ],
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
          const SizedBox(height: 10),
          _stepHead('Enter your birth date',
              'This helps us create your personalized horoscope.'),
          const SizedBox(height: 26),
          _wheelCard(
            topLabels: const ['Month', 'Day', 'Year'],
            topIcon: Icons.calendar_today_rounded,
            columns: [
              _WheelSpec(
                count: 12,
                initial: _birthDate.month - 1,
                label: (i) => _months[i],
                onChanged: (i) => _syncDate(month: i + 1),
              ),
              _WheelSpec(
                count: 31,
                initial: _birthDate.day - 1,
                label: (i) => '${i + 1}',
                onChanged: (i) => _syncDate(day: i + 1),
              ),
              _WheelSpec(
                count: 2010 - 1920 + 1,
                initial: _birthDate.year - 1920,
                label: (i) => '${1920 + i}',
                onChanged: (i) => _syncDate(year: 1920 + i),
              ),
            ],
          ),
          const SizedBox(height: 20),
          const InfoNote(
            icon: Icons.auto_awesome_rounded,
            title: 'Why we ask this?',
            body: 'Your birth date is essential to generate accurate '
                'astrological insights just for you.',
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
    // clamp day to valid range for the month
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
          const SizedBox(height: 10),
          _stepHead('Enter your birth time',
              'Accurate birth time allows us to give more precise predictions.'),
          const SizedBox(height: 26),
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
                  _WheelSpec(
                    count: 12,
                    initial: _hour - 1,
                    label: (i) => (i + 1).toString().padLeft(2, '0'),
                    onChanged: (i) => _hour = i + 1,
                  ),
                  _WheelSpec(
                    count: 60,
                    initial: _minute,
                    label: (i) => i.toString().padLeft(2, '0'),
                    onChanged: (i) => _minute = i,
                  ),
                  _WheelSpec(
                    count: 2,
                    initial: _pm ? 1 : 0,
                    label: (i) => i == 0 ? 'AM' : 'PM',
                    onChanged: (i) => _pm = i == 1,
                  ),
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
        decoration: BoxDecoration(
          color: Ob.lavender,
          borderRadius: BorderRadius.circular(18),
        ),
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
                border: Border.all(
                  color: _timeUnknown ? Ob.gold : const Color(0xFFCFC8E0),
                  width: 1.5,
                ),
              ),
              child: _timeUnknown
                  ? const Icon(Icons.check_rounded, size: 17, color: Colors.white)
                  : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text("I don't know my exact time of birth", style: Ob.noteTitle),
                  const SizedBox(height: 2),
                  Text(
                    'No worries! We can still generate up to 80% accurate '
                    'predictions without birth time.',
                    style: Ob.note,
                  ),
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
          const SizedBox(height: 10),
          _stepHead('Where were you born?',
              'Your birth place helps us calculate accurate planetary positions.'),
          const SizedBox(height: 22),
          _CitySearchField(
            initial: _birthPlace,
            onSelected: (c) => setState(() => _birthPlace = c),
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
          const SizedBox(height: 10),
          _stepHead('Tell us your relationship status',
              'This helps our astrologers give you more relevant and personalized guidance.',
              accent: 'relationship'),
          const SizedBox(height: 22),
          Row(
            children: [
              const Icon(Icons.auto_awesome, color: Ob.gold, size: 14),
              const SizedBox(width: 6),
              Text('Choose your status', style: Ob.sectionLabel),
            ],
          ),
          const SizedBox(height: 14),
          OptionRow(
            icon: Icons.favorite_rounded,
            iconBg: const Color(0xFFFDEBC7),
            iconColor: const Color(0xFFEBA019),
            label: 'Married',
            selected: _relationship == 'married',
            onTap: () => setState(() => _relationship = 'married'),
          ),
          const SizedBox(height: 12),
          OptionRow(
            icon: Icons.favorite_border_rounded,
            iconBg: Ob.lavenderChip,
            iconColor: Ob.purple,
            label: 'Single',
            selected: _relationship == 'single',
            onTap: () => setState(() => _relationship = 'single'),
          ),
          const SizedBox(height: 12),
          OptionRow(
            icon: Icons.heart_broken_rounded,
            iconBg: const Color(0xFFFBE0E0),
            iconColor: const Color(0xFFD86C6C),
            label: 'Divorced',
            selected: _relationship == 'divorced',
            onTap: () => setState(() => _relationship = 'divorced'),
          ),
          const SizedBox(height: 12),
          OptionRow(
            icon: Icons.people_alt_rounded,
            iconBg: Ob.lavenderChip,
            iconColor: Ob.purple,
            label: 'In a Relationship',
            selected: _relationship == 'in_relationship',
            onTap: () => setState(() => _relationship = 'in_relationship'),
          ),
          const SizedBox(height: 16),
          const InfoNote(
            icon: Icons.lock_outline_rounded,
            title: 'You can change this anytime',
            body: 'Your answers are private and secure.',
          ),
        ],
      ),
      footer: _footer('Next'),
    );
  }

  // ------------------------------------------------------- step: languages --
  Widget _languageStep() {
    const langs = <List<String>>[
      ['English', 'A'], ['Hindi', 'अ'], ['Bengali', 'অ'], ['Gujarati', 'ગ'],
      ['Kannada', 'ಕ'], ['Malayalam', 'മ'], ['Marathi', 'म'], ['Punjabi', 'ਪ'],
      ['Tamil', 'த'], ['Telugu', 'త'], ['Urdu', 'ا'],
    ];
    return OnboardingScaffold(
      stepIndex: 6,
      stepIcon: Icons.translate_rounded,
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 10),
          _stepHead('Select all your languages',
              "Choose the languages you're comfortable in. You can always change this later."),
          const SizedBox(height: 22),
          LayoutBuilder(builder: (context, c) {
            const spacing = 10.0;
            final w = (c.maxWidth - spacing) / 2;
            return Wrap(
              spacing: spacing,
              runSpacing: spacing,
              children: [
                for (final l in langs)
                  SizedBox(
                    width: w,
                    child: _languageTile(l[0], l[1]),
                  ),
              ],
            );
          }),
          const SizedBox(height: 18),
          const InfoNote(
            icon: Icons.language_rounded,
            body: 'You can add or remove languages anytime from your profile settings.',
          ),
        ],
      ),
      footer: _footer('Start chat with Astrologer', icon: Icons.arrow_forward_rounded),
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
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: selected ? Ob.selectedFill : Ob.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: selected ? Ob.selectedBorder : Ob.line,
            width: selected ? 1.6 : 1,
          ),
          boxShadow: selected ? null : Ob.softShadow,
        ),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(color: Ob.lavenderChip, shape: BoxShape.circle),
              alignment: Alignment.center,
              child: Text(glyph,
                  style: Ob.option.copyWith(color: Ob.purple, fontSize: 16)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(label,
                  style: Ob.option.copyWith(fontSize: 15),
                  overflow: TextOverflow.ellipsis),
            ),
            selected
                ? const GoldCheck(size: 22)
                : const Icon(Icons.add_rounded, color: Ob.purple, size: 20),
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
        borderRadius: BorderRadius.circular(18),
        boxShadow: Ob.softShadow,
      ),
      child: TextField(
        controller: controller,
        autofocus: true,
        textCapitalization: TextCapitalization.words,
        textInputAction: TextInputAction.done,
        style: Ob.option,
        onChanged: (_) => setState(() {}),
        onSubmitted: (_) => onSubmit?.call(),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: Ob.option.copyWith(color: const Color(0xFF9E98B0)),
          prefixIcon: Icon(icon, color: Ob.purple),
          filled: false,
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(vertical: 20, horizontal: 6),
        ),
      ),
    );
  }

  // Wheel picker card with an optional header, top labels, or bottom labels.
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
        borderRadius: BorderRadius.circular(24),
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
                    decoration:
                        BoxDecoration(color: Ob.lavenderChip, shape: BoxShape.circle),
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
                    Expanded(
                      child: Text(t,
                          textAlign: TextAlign.center,
                          style: Ob.note.copyWith(fontWeight: FontWeight.w600)),
                    ),
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
          // single continuous selection pill across all columns
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
      // Don't setState here — recreating the controller mid-scroll would fight
      // the wheel's momentum. Values are captured straight into state fields.
      onSelectedItemChanged: spec.onChanged,
      children: List.generate(
        spec.count,
        (i) => Center(child: Text(spec.label(i), style: Ob.wheel)),
      ),
    );
  }
}

class _WheelSpec {
  const _WheelSpec({
    required this.count,
    required this.initial,
    required this.label,
    required this.onChanged,
  });
  final int count;
  final int initial;
  final String Function(int) label;
  final ValueChanged<int> onChanged;
}

/// Birth-place typeahead: recently-searched chips, popular Indian cities, and a
/// static filter. No network dependency; easy to swap for a Places API later.
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

  static const _recent = ['Noida, UP, India', 'Moradabad, UP, India'];
  static const _popular = <List<String>>[
    ['Delhi, India', 'Delhi, India'],
    ['Mumbai, India', 'Maharashtra, India'],
    ['Bengaluru, India', 'Karnataka, India'],
    ['Kolkata, India', 'West Bengal, India'],
  ];
  static const _all = [
    'Delhi, India', 'Mumbai, Maharashtra, India', 'Bengaluru, Karnataka, India',
    'Kolkata, West Bengal, India', 'Chennai, Tamil Nadu, India',
    'Hyderabad, Telangana, India', 'Pune, Maharashtra, India',
    'Ahmedabad, Gujarat, India', 'Jaipur, Rajasthan, India',
    'Lucknow, UP, India', 'Noida, UP, India', 'Moradabad, UP, India',
    'Chandigarh, India', 'Surat, Gujarat, India', 'Kochi, Kerala, India',
    'Bhopal, MP, India', 'Patna, Bihar, India', 'Guwahati, Assam, India',
  ];

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  List<String> get _matches {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return const [];
    return _all.where((c) => c.toLowerCase().contains(q)).take(6).toList();
  }

  void _pick(String city) {
    _c.text = city;
    _c.selection = TextSelection.collapsed(offset: city.length);
    setState(() => _query = '');
    widget.onSelected(city);
    FocusScope.of(context).unfocus();
  }

  @override
  Widget build(BuildContext context) {
    final matches = _matches;
    final searching = _query.trim().isNotEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            boxShadow: Ob.softShadow,
          ),
          child: TextField(
            controller: _c,
            autofocus: true,
            style: Ob.option.copyWith(fontSize: 16),
            onChanged: (v) {
              setState(() => _query = v);
              widget.onSelected(v);
            },
            decoration: InputDecoration(
              hintText: 'Search your birth place',
              hintStyle: Ob.option.copyWith(color: const Color(0xFF9E98B0), fontSize: 16),
              prefixIcon: const Icon(Icons.location_on_outlined, color: Ob.purple),
              suffixIcon: const Icon(Icons.search_rounded, color: Ob.purple),
              filled: false,
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(vertical: 18),
            ),
          ),
        ),
        const SizedBox(height: 18),
        if (searching)
          ...matches.map((c) => _placeTile(Icons.place_outlined, c, null))
        else ...[
          Text('Recently searched',
              style: Ob.note.copyWith(color: Ob.navy, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: _recent
                .map((r) => GestureDetector(
                      onTap: () => _pick(r),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: Ob.lavenderChip,
                          borderRadius: BorderRadius.circular(30),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.history_rounded, size: 16, color: Ob.purple),
                            const SizedBox(width: 6),
                            Text(r, style: Ob.note.copyWith(color: Ob.navy)),
                          ],
                        ),
                      ),
                    ))
                .toList(),
          ),
          const SizedBox(height: 18),
          Text('Popular places',
              style: Ob.note.copyWith(color: Ob.navy, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              boxShadow: Ob.softShadow,
            ),
            child: Column(
              children: [
                for (var i = 0; i < _popular.length; i++)
                  _placeTile(Icons.account_balance_outlined, _popular[i][0], _popular[i][1],
                      divider: i != _popular.length - 1),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _placeTile(IconData icon, String title, String? subtitle, {bool divider = false}) {
    return Column(
      children: [
        ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
          leading: Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(color: Ob.lavenderChip, shape: BoxShape.circle),
            child: Icon(icon, color: Ob.purple, size: 20),
          ),
          title: Text(title, style: Ob.option.copyWith(fontSize: 16)),
          subtitle: subtitle == null ? null : Text(subtitle, style: Ob.note),
          trailing: const Icon(Icons.chevron_right_rounded, color: Color(0xFFB9B3C9)),
          onTap: () => _pick(title),
        ),
        if (divider)
          const Divider(height: 1, indent: 66, endIndent: 16, color: Ob.line),
      ],
    );
  }
}
