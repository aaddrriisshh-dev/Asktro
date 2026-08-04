import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import 'package:google_fonts/google_fonts.dart';

import 'auth_controller.dart';
import 'otp_screen.dart';
import '../profile/cms_viewer_screen.dart';
import '../profile_setup/onboarding_style.dart';
import '../profile_setup/onboarding_widgets.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _phone = TextEditingController();
  bool _loading = false;
  String? _error;

  // Make the "Terms of Service" / "Privacy Policy" words in the consent line
  // tappable — a user must be able to READ what they're agreeing to for the
  // consent (and DPDP consent) to be meaningful. Opens the same in-app CMS
  // viewer the Profile tab uses. Recognizers are disposed with the screen.
  late final TapGestureRecognizer _termsTap =
      TapGestureRecognizer()..onTap = () => _openCms('terms', 'Terms of Service');
  late final TapGestureRecognizer _privacyTap =
      TapGestureRecognizer()..onTap = () => _openCms('privacy', 'Privacy Policy');
  late final TapGestureRecognizer _disclaimerTap =
      TapGestureRecognizer()..onTap = () => _openCms('disclaimer', 'Disclaimer');

  void _openCms(String page, String title) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => CmsViewerScreen(page: page, title: title)),
    );
  }

  bool get _validPhone => _phone.text.trim().length == 10;

  Future<void> _continue() async {
    if (!_validPhone) {
      setState(() => _error = 'Enter a valid 10-digit mobile number.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final e164 = '+91${_phone.text.trim()}';
    await ref.read(authControllerProvider).startPhoneVerification(
      e164Phone: e164,
      codeSent: (verificationId, resendToken) {
        if (!mounted) return;
        setState(() => _loading = false);
        context.push('/otp',
            extra: OtpArgs(phone: e164, verificationId: verificationId, resendToken: resendToken),);
      },
      onAutoVerified: (_) {
        if (mounted) context.go('/home');
      },
      onError: (failure) {
        if (!mounted) return;
        setState(() {
          _loading = false;
          _error = failure.message;
        });
      },
    );
  }

  Future<void> _social(Future<Result<void>> Function() action) async {
    // Consent is the passive "by continuing you agree…" notice shown beneath the
    // sign-in buttons (18+ + Terms/Privacy), so tapping any of them = agreeing.
    setState(() {
      _loading = true;
      _error = null;
    });
    final r = await action();
    if (!mounted) return;
    r.when(
      success: (_) => context.go('/home'),
      failure: (f) => setState(() {
        _loading = false;
        _error = f.message;
      }),
    );
  }

  @override
  void dispose() {
    _phone.dispose();
    _termsTap.dispose();
    _privacyTap.dispose();
    _disclaimerTap.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.read(authControllerProvider);
    return Scaffold(
      backgroundColor: Ob.bgColor,
      body: Stack(
        // Expand to the full screen so Positioned(bottom: 0) anchors to the
        // screen bottom. Without this the Stack shrink-wrapped to the scrolling
        // form, and the scenery was pinned to the form's bottom (mid-screen).
        fit: StackFit.expand,
        children: [
          // celestial background: faint zodiac-wheel + temple scenery
          Positioned(
            top: 40,
            right: -150,
            child: IgnorePointer(
              child: Opacity(opacity: 0.16, child: Image.asset(Ob.zodiacWheel, width: 430)),
            ),
          ),
          // Temple scenery flush on the screen bottom. The asset is now fully
          // opaque (mountains flattened onto the #FFFDF7 background), so its
          // top blends into the page and there is no transparency/checkerboard.
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: IgnorePointer(
              child: Image.asset(
                Ob.sceneryBase,
                fit: BoxFit.fitWidth,
                alignment: Alignment.bottomCenter,
              ),
            ),
          ),
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 28),
                  Text('Welcome to',
                      style: GoogleFonts.cormorantGaramond(
                          fontSize: 26, fontWeight: FontWeight.w400, color: Ob.navy,),),
                  Text('Zodia',
                      style: GoogleFonts.cormorantGaramond(
                          fontSize: 56,
                          fontWeight: FontWeight.w500,
                          height: 0.95,
                          letterSpacing: 1,
                          color: const Color(0xFF1A150C),),),
                  const SizedBox(height: 14),
                  const SparkleDivider(),
                  const SizedBox(height: 16),
                  Text('Log in to consult trusted astrologers, anytime.', style: Ob.subtitle),
                  const SizedBox(height: 30),
                  _phoneField(),
                  const SizedBox(height: 14),
                  if (_error != null) ...[
                    const SizedBox(height: 6),
                    Text(_error!, style: Ob.note.copyWith(color: const Color(0xFFD25360))),
                  ],
                  const SizedBox(height: 18),
                  GoldButton(label: 'Continue', loading: _loading, onPressed: _loading ? null : _continue),
                  const SizedBox(height: 22),
                  Row(children: [
                    const Expanded(child: Divider(color: Ob.border)),
                    Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: Text('or', style: Ob.note)),
                    const Expanded(child: Divider(color: Ob.border)),
                  ],),
                  const SizedBox(height: 22),
                  SecondaryButton(
                    label: 'Continue with Google',
                    leading: SvgPicture.asset('assets/brand/google_g.svg', width: 20, height: 20),
                    onPressed: _loading ? null : () => _social(auth.signInWithGoogle),
                  ),
                  if (Theme.of(context).platform == TargetPlatform.iOS) ...[
                    const SizedBox(height: 12),
                    SecondaryButton(
                      label: 'Continue with Apple',
                      icon: Icons.apple,
                      onPressed: _loading ? null : () => _social(auth.signInWithApple),
                    ),
                  ],
                  const SizedBox(height: 20),
                  // Passive consent (AstroTalk-style): tapping any sign-in button
                  // above = agreeing. Small + muted so it isn't a burden, but the
                  // 18+ affirmation + tappable policy links keep it compliant.
                  Text.rich(
                    TextSpan(
                      style: Ob.note.copyWith(color: Ob.grey, fontSize: 11, height: 1.4),
                      children: [
                        const TextSpan(text: 'By continuing, you confirm you’re 18+ and agree to our '),
                        TextSpan(text: 'Terms of Service', style: const TextStyle(color: Ob.grey, decoration: TextDecoration.underline, decorationColor: Ob.grey), recognizer: _termsTap),
                        const TextSpan(text: ' and '),
                        TextSpan(text: 'Privacy Policy', style: const TextStyle(color: Ob.grey, decoration: TextDecoration.underline, decorationColor: Ob.grey), recognizer: _privacyTap),
                        const TextSpan(text: '.'),
                      ],
                    ),
                    textAlign: TextAlign.left,
                  ),
                  const SizedBox(height: 7),
                  Text.rich(
                    TextSpan(
                      style: Ob.note.copyWith(color: Ob.grey, fontSize: 11, height: 1.4),
                      children: [
                        const TextSpan(text: 'For guidance & entertainment only. '),
                        TextSpan(text: 'Disclaimer', style: const TextStyle(color: Ob.grey, decoration: TextDecoration.underline, decorationColor: Ob.grey), recognizer: _disclaimerTap),
                      ],
                    ),
                    textAlign: TextAlign.left,
                  ),
                  const SizedBox(height: 10),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _phoneField() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: Ob.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Ob.border),
        boxShadow: Ob.softShadow,
      ),
      child: Row(
        children: [
          const Icon(Icons.phone_iphone_rounded, color: Ob.purple, size: 20),
          const SizedBox(width: 10),
          Text('+91', style: Ob.option),
          Container(width: 1, height: 22, margin: const EdgeInsets.symmetric(horizontal: 12), color: Ob.border),
          Expanded(
            child: TextField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              maxLength: 10,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              onChanged: (_) => setState(() {}),
              style: Ob.option,
              decoration: const InputDecoration(
                counterText: '',
                border: InputBorder.none,
                hintText: 'Mobile number',
                isDense: true,
                contentPadding: EdgeInsets.symmetric(vertical: 16),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
