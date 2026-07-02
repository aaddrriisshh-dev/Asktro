import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';

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
          verificationCompleted: (cred) async =>
              ref.read(firebaseAuthProvider).signInWithCredential(cred),
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
      final cred = PhoneAuthProvider.credential(
          verificationId: _verificationId!, smsCode: _code.text.trim());
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
      // Router redirect handles navigation on auth state change.
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
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: AppSpacing.xxl),
              Container(
                width: 72,
                height: 72,
                decoration: const BoxDecoration(gradient: AppColors.primaryGradient, shape: BoxShape.circle),
                child: const Icon(Icons.auto_awesome, color: Colors.white, size: 36),
              ),
              const SizedBox(height: AppSpacing.xl),
              Text('Astrologer sign in', style: AppTypography.title),
              const SizedBox(height: AppSpacing.xs),
              Text('Use the credentials provided by the ASKTRO team.',
                  style: AppTypography.body.copyWith(color: AppColors.textSecondary)),
              const SizedBox(height: AppSpacing.xl),
              SegmentedButton<_Mode>(
                segments: const [
                  ButtonSegment(value: _Mode.email, label: Text('Email'), icon: Icon(Icons.mail_outline)),
                  ButtonSegment(value: _Mode.phone, label: Text('Phone'), icon: Icon(Icons.phone_iphone)),
                ],
                selected: {_mode},
                onSelectionChanged: (s) => setState(() {
                  _mode = s.first;
                  _error = null;
                  _verificationId = null;
                }),
              ),
              const SizedBox(height: AppSpacing.xl),
              if (_mode == _Mode.email) ..._emailFields() else ..._phoneFields(),
              if (_error != null) ...[
                const SizedBox(height: AppSpacing.sm),
                Text(_error!, style: AppTypography.caption.copyWith(color: AppColors.error)),
              ],
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _emailFields() => [
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(hintText: 'Email', prefixIcon: Icon(Icons.mail_outline)),
        ),
        const SizedBox(height: AppSpacing.md),
        TextField(
          controller: _password,
          obscureText: true,
          decoration: const InputDecoration(hintText: 'Password', prefixIcon: Icon(Icons.lock_outline)),
        ),
        const SizedBox(height: AppSpacing.xl),
        PrimaryButton(label: 'Sign in', loading: _loading, onPressed: _loading ? null : _loginEmail),
      ];

  List<Widget> _phoneFields() => [
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          maxLength: 10,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(
            counterText: '',
            prefixText: '+91  ',
            hintText: 'Mobile number',
            prefixIcon: Icon(Icons.phone_iphone_rounded),
          ),
        ),
        if (_verificationId != null) ...[
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _code,
            keyboardType: TextInputType.number,
            maxLength: 6,
            textAlign: TextAlign.center,
            style: AppTypography.title.copyWith(letterSpacing: 10),
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(counterText: '', hintText: '••••••'),
          ),
        ],
        const SizedBox(height: AppSpacing.xl),
        PrimaryButton(
          label: _verificationId == null ? 'Send code' : 'Verify',
          loading: _loading,
          onPressed: _loading ? null : (_verificationId == null ? _sendCode : _verifyCode),
        ),
      ];
}
