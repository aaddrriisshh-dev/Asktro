import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import 'auth_controller.dart';
import 'otp_screen.dart';

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
              Text('Welcome to ASKTRO', style: AppTypography.title),
              const SizedBox(height: AppSpacing.xs),
              Text('Log in to consult trusted astrologers.',
                  style: AppTypography.body.copyWith(color: AppColors.textSecondary)),
              const SizedBox(height: AppSpacing.xxl),
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                maxLength: 10,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  counterText: '',
                  prefixText: '+91  ',
                  hintText: 'Mobile number',
                  prefixIcon: Icon(Icons.phone_iphone_rounded, color: AppColors.primary),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  Checkbox(
                    value: _agreed,
                    activeColor: AppColors.primary,
                    onChanged: (v) => setState(() => _agreed = v ?? false),
                  ),
                  Expanded(
                    child: Text('I agree to the Terms of Service and Privacy Policy.',
                        style: AppTypography.caption),
                  ),
                ],
              ),
              if (_error != null) ...[
                const SizedBox(height: AppSpacing.sm),
                Text(_error!, style: AppTypography.caption.copyWith(color: AppColors.error)),
              ],
              const SizedBox(height: AppSpacing.lg),
              PrimaryButton(label: 'Continue', loading: _loading, onPressed: _loading ? null : _continue),
              const SizedBox(height: AppSpacing.xl),
              Row(children: const [
                Expanded(child: Divider()),
                Padding(padding: EdgeInsets.symmetric(horizontal: 12), child: Text('or')),
                Expanded(child: Divider()),
              ]),
              const SizedBox(height: AppSpacing.xl),
              SecondaryButton(
                label: 'Continue with Google',
                icon: Icons.g_mobiledata_rounded,
                onPressed: _loading ? null : () => _social(auth.signInWithGoogle),
              ),
              const SizedBox(height: AppSpacing.md),
              if (Theme.of(context).platform == TargetPlatform.iOS)
                SecondaryButton(
                  label: 'Continue with Apple',
                  icon: Icons.apple,
                  onPressed: _loading ? null : () => _social(auth.signInWithApple),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
