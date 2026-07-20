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
  bool _agreed = false;
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
    if (!_agreed) {
      setState(() => _error = 'Please confirm you’re 18+ and accept the Terms & Privacy Policy to continue.');
      return;
    }
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
    // Consent gate applies to EVERY sign-in path, not just phone — a user must
    // never be able to create an account via Google/Apple without agreeing.
    if (!_agreed) {
      setState(() => _error = 'Please confirm you’re 18+ and accept the Terms & Privacy Policy to continue.');
      return;
    }
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
          // opaque (mountains flattened onto the #F5F2FF background), so its
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
                  Text('Asktro',
                      style: GoogleFonts.cormorantGaramond(
                          fontSize: 56,
                          fontWeight: FontWeight.w500,
                          height: 0.95,
                          letterSpacing: 1,
                          color: const Color(0xFF4B2A80),),),
                  const SizedBox(height: 14),
                  const SparkleDivider(),
                  const SizedBox(height: 16),
                  Text('Log in to consult trusted astrologers, anytime.', style: Ob.subtitle),
                  const SizedBox(height: 30),
                  _phoneField(),
                  const SizedBox(height: 4),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Checkbox(
                        value: _agreed,
                        activeColor: Ob.purple,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
                        onChanged: (v) => setState(() => _agreed = v ?? false),
                      ),
                      Expanded(
                        // Combines the required 18+ age gate with the Terms/Privacy
                        // acceptance in one checkbox the user must tick to continue.
                        child: Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text.rich(
                                TextSpan(
                                  style: Ob.note,
                                  children: [
                                    const TextSpan(text: 'I am 18 or older and agree to the '),
                                    TextSpan(
                                      text: 'Terms of Service',
                                      style: TextStyle(
                                        color: Ob.purple,
                                        fontWeight: FontWeight.w600,
                                        decoration: TextDecoration.underline,
                                        decorationColor: Ob.purple,
                                      ),
                                      recognizer: _termsTap,
                                    ),
                                    const TextSpan(text: ' and '),
                                    TextSpan(
                                      text: 'Privacy Policy',
                                      style: TextStyle(
                                        color: Ob.purple,
                                        fontWeight: FontWeight.w600,
                                        decoration: TextDecoration.underline,
                                        decorationColor: Ob.purple,
                                      ),
                                      recognizer: _privacyTap,
                                    ),
                                    const TextSpan(text: '.'),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 7),
                              // Compact disclaimer — same font as the consent line
                              // above, aligned under it (shares this column). Full
                              // text is one tap away on the Disclaimer page.
                              Text.rich(
                                TextSpan(
                                  style: Ob.note,
                                  children: [
                                    const TextSpan(text: 'For guidance & entertainment only — not professional advice. '),
                                    TextSpan(
                                      text: 'Disclaimer',
                                      style: TextStyle(
                                        color: Ob.purple,
                                        fontWeight: FontWeight.w600,
                                        decoration: TextDecoration.underline,
                                        decorationColor: Ob.purple,
                                      ),
                                      recognizer: _disclaimerTap,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
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
