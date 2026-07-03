import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import 'auth_controller.dart';
import 'otp_screen.dart';
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

  bool get _validPhone => _phone.text.trim().length == 10;

  Future<void> _continue() async {
    if (!_agreed) {
      setState(() => _error = 'Please accept the Terms & Privacy Policy to continue.');
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
            extra: OtpArgs(phone: e164, verificationId: verificationId, resendToken: resendToken));
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
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.read(authControllerProvider);
    return Scaffold(
      backgroundColor: Ob.bgColor,
      body: Stack(
        children: [
          // celestial background: faint zodiac-wheel + temple scenery
          Positioned(
            top: 40,
            right: -150,
            child: IgnorePointer(
              child: Opacity(opacity: 0.16, child: Image.asset(Ob.zodiacWheel, width: 430)),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: IgnorePointer(
              child: Opacity(opacity: 0.5, child: Image.asset(Ob.scenery, fit: BoxFit.fitWidth)),
            ),
          ),
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 18),
                  const Center(child: AppLogo(height: 60)),
                  const SizedBox(height: 42),
                  Text.rich(TextSpan(
                    style: Ob.hero.copyWith(fontSize: 40, height: 1.05),
                    children: [
                      const TextSpan(text: 'Welcome to\n'),
                      TextSpan(text: 'ASKTRO', style: TextStyle(color: Ob.purpleDeep)),
                    ],
                  )),
                  const SizedBox(height: 14),
                  const SparkleDivider(),
                  const SizedBox(height: 16),
                  Text('Log in to consult trusted astrologers, anytime.', style: Ob.subtitle),
                  const SizedBox(height: 30),
                  _phoneField(),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Checkbox(
                        value: _agreed,
                        activeColor: Ob.purple,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
                        onChanged: (v) => setState(() => _agreed = v ?? false),
                      ),
                      Expanded(
                        child: Text('I agree to the Terms of Service and Privacy Policy.', style: Ob.note),
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
                    Expanded(child: Divider(color: Ob.border)),
                    Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: Text('or', style: Ob.note)),
                    Expanded(child: Divider(color: Ob.border)),
                  ]),
                  const SizedBox(height: 22),
                  SecondaryButton(
                    label: 'Continue with Google',
                    icon: Icons.g_mobiledata_rounded,
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
