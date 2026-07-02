import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
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

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _login() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Enter your email and password.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(firebaseAuthProvider).signInWithEmailAndPassword(
            email: _email.text.trim(),
            password: _password.text,
          );
      // Router redirect handles navigation on auth state change.
    } on FirebaseAuthException catch (e) {
      setState(() {
        _loading = false;
        _error = e.code == 'invalid-credential' || e.code == 'wrong-password'
            ? 'Incorrect email or password.'
            : (e.message ?? 'Sign-in failed');
      });
    }
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
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
              const SizedBox(height: AppSpacing.xxl),
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
              if (_error != null) ...[
                const SizedBox(height: AppSpacing.sm),
                Text(_error!, style: AppTypography.caption.copyWith(color: AppColors.error)),
              ],
              const SizedBox(height: AppSpacing.xl),
              PrimaryButton(label: 'Sign in', loading: _loading, onPressed: _loading ? null : _login),
            ],
          ),
        ),
      ),
    );
  }
}
