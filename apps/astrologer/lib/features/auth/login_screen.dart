import 'dart:math' as math;

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/providers.dart';
import '../../ui/celestial.dart';

/// Astrologer login: email + password (admin-created accounts) or phone OTP.
/// Approval gating happens on the dashboard once the profile is loaded.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

enum _Mode { email, phone }

class _LoginScreenState extends ConsumerState<LoginScreen> {
  static const _zodiac = 'assets/onboarding/zodiac_wheel.png';
  static const _wordmark = 'assets/onboarding/logo_wordmark.webp';

  _Mode _mode = _Mode.email;
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _phone = TextEditingController();
  final _code = TextEditingController();

  bool _loading = false;
  String? _error;
  String? _verificationId;

  Future<void> _loginEmail() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Enter your email and password.');
      return;
    }
    _run(() async {
      await ref
          .read(firebaseAuthProvider)
          .signInWithEmailAndPassword(email: _email.text.trim(), password: _password.text);
    });
  }

  Future<void> _sendCode() async {
    if (_phone.text.trim().length != 10) {
      setState(() => _error = 'Enter a valid 10-digit number.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    await ref.read(firebaseAuthProvider).verifyPhoneNumber(
          phoneNumber: '+91${_phone.text.trim()}',
          verificationCompleted: (cred) async => ref.read(firebaseAuthProvider).signInWithCredential(cred),
          verificationFailed: (e) => setState(() {
            _loading = false;
            _error = e.message ?? 'Verification failed';
          }),
          codeSent: (id, _) => setState(() {
            _loading = false;
            _verificationId = id;
          }),
          codeAutoRetrievalTimeout: (_) {},
        );
  }

  Future<void> _verifyCode() async {
    if (_verificationId == null || _code.text.trim().length < 6) {
      setState(() => _error = 'Enter the 6-digit code.');
      return;
    }
    _run(() async {
      final cred = PhoneAuthProvider.credential(verificationId: _verificationId!, smsCode: _code.text.trim());
      await ref.read(firebaseAuthProvider).signInWithCredential(cred);
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await action();
    } on FirebaseAuthException catch (e) {
      setState(() {
        _loading = false;
        _error = e.code == 'invalid-credential' || e.code == 'wrong-password'
            ? 'Incorrect credentials.'
            : e.code == 'invalid-verification-code'
                ? 'That code is incorrect.'
                : (e.message ?? 'Sign-in failed');
      });
    }
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final topPad = MediaQuery.of(context).padding.top;
    return Scaffold(
      body: Stack(
        children: [
          // Celestial lavender sky — the splash, settled into a login.
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment(0, -0.4),
                  radius: 1.1,
                  colors: [Color(0xFFFBF9FF), Color(0xFFF5F2FF), Color(0xFFEDE7FB)],
                  stops: [0.0, 0.5, 1.0],
                ),
              ),
            ),
          ),
          // faint zodiac wheel behind the wordmark
          Positioned(
            top: topPad + 6,
            left: -size.width * 0.12,
            child: Opacity(opacity: 0.07, child: Image.asset(_zodiac, width: size.width * 1.24)),
          ),
          Positioned(
            top: topPad + 64,
            right: 42,
            child: const Icon(Icons.auto_awesome, color: Color(0xFFEAD079), size: 16),
          ),
          Positioned(
            top: topPad + 150,
            left: 34,
            child: const Icon(Icons.auto_awesome, color: Color(0xFFE6C86A), size: 12),
          ),
          SafeArea(
            child: ListView(
              padding: EdgeInsets.fromLTRB(20, 36, 20, 24 + MediaQuery.of(context).padding.bottom),
              children: [
                Center(child: Image.asset(_wordmark, width: math.min(size.width * 0.52, 240))),
                const SizedBox(height: 14),
                Center(
                  child: Text(
                    'GUIDANCE WRITTEN IN THE STARS',
                    style: GoogleFonts.cormorantGaramond(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 2.2,
                      color: const Color(0xFF4B2A80),
                    ),
                  ),
                ),
                const SizedBox(height: 30),
                // form on a clean white card so fields stay crisp on the sky
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Sky.card,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: Sky.line),
                    boxShadow: Sky.lift,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Sign in', style: Sky.h1.copyWith(fontSize: 22)),
                      const SizedBox(height: 4),
                      Text('Use the credentials provided by the Asktro team.',
                          style: Sky.label.copyWith(fontSize: 13)),
                      const SizedBox(height: 18),
                      _segmented(),
                      const SizedBox(height: 16),
                      if (_mode == _Mode.email) ..._emailFields() else ..._phoneFields(),
                      if (_error != null) ...[
                        const SizedBox(height: 14),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                          decoration: BoxDecoration(color: Sky.red.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
                          child: Row(
                            children: [
                              const Icon(Icons.error_outline_rounded, size: 17, color: Sky.red),
                              const SizedBox(width: 9),
                              Expanded(child: Text(_error!, style: Sky.label.copyWith(fontSize: 12.5, color: Sky.red))),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                Center(
                  child: Text('Asktro Tech Private Limited',
                      style: Sky.label.copyWith(fontSize: 11, color: Sky.ink3)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _segmented() {
    Widget seg(_Mode m, IconData icon, String label) {
      final on = _mode == m;
      return Expanded(
        child: GestureDetector(
          onTap: () => setState(() {
            _mode = m;
            _error = null;
            _verificationId = null;
          }),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: on ? Sky.card : Colors.transparent,
              borderRadius: BorderRadius.circular(12),
              boxShadow: on ? Sky.soft : null,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 17, color: on ? Sky.purple : Sky.ink2),
                const SizedBox(width: 7),
                Text(label,
                    style: Sky.label.copyWith(
                        fontSize: 13.5, color: on ? Sky.ink : Sky.ink2, fontWeight: on ? FontWeight.w800 : FontWeight.w600,),),
              ],
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Sky.surface, borderRadius: BorderRadius.circular(14)),
      child: Row(children: [seg(_Mode.email, Icons.mail_outline_rounded, 'Email'), seg(_Mode.phone, Icons.phone_iphone_rounded, 'Phone')]),
    );
  }

  InputDecoration _dec(String hint, IconData icon, {String? prefix}) => InputDecoration(
        hintText: hint,
        hintStyle: Sky.label.copyWith(fontSize: 14, color: Sky.ink3),
        prefixIcon: Icon(icon, size: 20, color: Sky.ink2),
        prefixText: prefix,
        prefixStyle: Sky.body,
        counterText: '',
        filled: true,
        fillColor: Sky.surface,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
        contentPadding: const EdgeInsets.symmetric(vertical: 16),
      );

  List<Widget> _emailFields() => [
        TextField(controller: _email, keyboardType: TextInputType.emailAddress, style: Sky.body, decoration: _dec('Email', Icons.mail_outline_rounded)),
        const SizedBox(height: 12),
        TextField(controller: _password, obscureText: true, style: Sky.body, decoration: _dec('Password', Icons.lock_outline_rounded)),
        const SizedBox(height: 22),
        GoldButton(label: 'Sign in', icon: Icons.arrow_forward_rounded, loading: _loading, onPressed: _loading ? null : _loginEmail),
      ];

  List<Widget> _phoneFields() => [
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          maxLength: 10,
          style: Sky.body,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: _dec('Mobile number', Icons.phone_iphone_rounded, prefix: '+91  '),
        ),
        if (_verificationId != null) ...[
          const SizedBox(height: 12),
          TextField(
            controller: _code,
            keyboardType: TextInputType.number,
            maxLength: 6,
            textAlign: TextAlign.center,
            style: Sky.h1.copyWith(letterSpacing: 10),
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: _dec('••••••', Icons.password_rounded),
          ),
        ],
        const SizedBox(height: 22),
        GoldButton(
          label: _verificationId == null ? 'Send code' : 'Verify',
          icon: Icons.arrow_forward_rounded,
          loading: _loading,
          onPressed: _loading ? null : (_verificationId == null ? _sendCode : _verifyCode),
        ),
      ];
}
