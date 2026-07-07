import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
    final topPad = MediaQuery.of(context).padding.top;
    return SkyScaffold(
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          // Celestial hero
          Container(
            clipBehavior: Clip.antiAlias,
            decoration: const BoxDecoration(
              gradient: Sky.heroGrad,
              borderRadius: BorderRadius.vertical(bottom: Radius.circular(34)),
            ),
            child: Stack(
              children: [
                const Positioned.fill(child: CelestialWash()),
                Padding(
                  padding: EdgeInsets.fromLTRB(24, topPad + 46, 24, 46),
                  child: Column(
                    children: [
                      Container(
                        width: 78,
                        height: 78,
                        decoration: BoxDecoration(
                          gradient: Sky.goldGrad,
                          shape: BoxShape.circle,
                          boxShadow: [BoxShadow(color: Sky.gold.withValues(alpha: 0.4), blurRadius: 22, offset: const Offset(0, 8))],
                        ),
                        child: const Center(
                          child: Text('A',
                              style: TextStyle(
                                  fontFamily: '.SF Pro Display',
                                  fontSize: 42,
                                  fontWeight: FontWeight.w800,
                                  color: Sky.purpleDeep)),
                        ),
                      ),
                      const SizedBox(height: 18),
                      Text('Asktro Consultation',
                          style: Sky.h1.copyWith(color: Colors.white, fontSize: 24)),
                      const SizedBox(height: 6),
                      Text('The professional astrologer workspace',
                          style: Sky.label.copyWith(color: Colors.white.withValues(alpha: 0.8), fontSize: 13),
                          textAlign: TextAlign.center),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(20, 26, 20, 30 + MediaQuery.of(context).padding.bottom),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Sign in', style: Sky.h1),
                const SizedBox(height: 4),
                Text('Use the credentials provided by the Asktro team.',
                    style: Sky.label.copyWith(fontSize: 13)),
                const SizedBox(height: 20),
                _segmented(),
                const SizedBox(height: 18),
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
                        fontSize: 13.5, color: on ? Sky.ink : Sky.ink2, fontWeight: on ? FontWeight.w800 : FontWeight.w600)),
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
