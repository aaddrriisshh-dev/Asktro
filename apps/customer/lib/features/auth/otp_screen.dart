import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import 'auth_controller.dart';

class OtpArgs {
  const OtpArgs({required this.phone, required this.verificationId, this.resendToken});
  final String phone;
  final String verificationId;
  final int? resendToken;
}

class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key, required this.args});
  final OtpArgs args;

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _code = TextEditingController();
  late String _verificationId = widget.args.verificationId;
  late int? _resendToken = widget.args.resendToken;
  bool _loading = false;
  String? _error;
  int _seconds = 60;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startCountdown();
  }

  void _startCountdown() {
    _seconds = 60;
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_seconds == 0) {
        t.cancel();
      } else {
        setState(() => _seconds--);
      }
    });
  }

  Future<void> _verify() async {
    if (_code.text.trim().length < 6) {
      setState(() => _error = 'Enter the 6-digit code.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final r = await ref.read(authControllerProvider).confirmOtp(
          verificationId: _verificationId,
          smsCode: _code.text.trim(),
          phone: widget.args.phone,
        );
    if (!mounted) return;
    r.when(
      success: (_) => context.go('/home'),
      failure: (f) => setState(() {
        _loading = false;
        _error = f.message;
      }),
    );
  }

  Future<void> _resend() async {
    if (_seconds > 0) return;
    await ref.read(authControllerProvider).startPhoneVerification(
      e164Phone: widget.args.phone,
      resendToken: _resendToken,
      codeSent: (id, token) {
        setState(() {
          _verificationId = id;
          _resendToken = token;
        });
        _startCountdown();
      },
      onError: (f) => setState(() => _error = f.message),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Verify your number', style: AppTypography.title),
              const SizedBox(height: AppSpacing.xs),
              Row(
                children: [
                  Text('Code sent to ${widget.args.phone}',
                      style: AppTypography.body.copyWith(color: AppColors.textSecondary),),
                  TextButton(onPressed: () => context.pop(), child: const Text('Edit')),
                ],
              ),
              const SizedBox(height: AppSpacing.xl),
              TextField(
                controller: _code,
                keyboardType: TextInputType.number,
                maxLength: 6,
                textAlign: TextAlign.center,
                style: AppTypography.title.copyWith(letterSpacing: 12),
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                onChanged: (v) {
                  if (v.length == 6) _verify();
                },
                decoration: const InputDecoration(counterText: '', hintText: '••••••'),
              ),
              if (_error != null) ...[
                const SizedBox(height: AppSpacing.sm),
                Text(_error!, style: AppTypography.caption.copyWith(color: AppColors.error)),
              ],
              const SizedBox(height: AppSpacing.lg),
              PrimaryButton(label: 'Verify', loading: _loading, onPressed: _loading ? null : _verify),
              const SizedBox(height: AppSpacing.lg),
              Center(
                child: _seconds > 0
                    ? Text('Resend code in 00:${_seconds.toString().padLeft(2, '0')}',
                        style: AppTypography.caption,)
                    : TextButton(onPressed: _resend, child: const Text('Resend code')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
