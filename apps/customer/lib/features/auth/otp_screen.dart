import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import 'auth_controller.dart';
import '../profile_setup/onboarding_style.dart';
import '../profile_setup/onboarding_widgets.dart';

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

class _OtpScreenState extends ConsumerState<OtpScreen> with SingleTickerProviderStateMixin {
  static const _len = 6;

  final _code = TextEditingController();
  final _focus = FocusNode();
  late String _verificationId = widget.args.verificationId;
  late int? _resendToken = widget.args.resendToken;
  bool _loading = false;
  String? _error;
  int _seconds = 60;
  Timer? _timer;

  // Gentle horizontal shake on a wrong code — a small, human touch instead of a
  // bare red line.
  late final AnimationController _shake =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 380));

  @override
  void initState() {
    super.initState();
    _startCountdown();
    // Focus after first frame so the keyboard opens and the OS can offer the
    // SMS code straight away.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
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

  void _onChanged(String v) {
    final digits = v.replaceAll(RegExp(r'\D'), '');
    if (digits != v) {
      _code.value = TextEditingValue(
        text: digits,
        selection: TextSelection.collapsed(offset: digits.length),
      );
    }
    setState(() => _error = null);
    if (digits.length == _len) _verify();
  }

  Future<void> _verify() async {
    if (_code.text.trim().length < _len) {
      setState(() => _error = 'Enter the 6-digit code.');
      return;
    }
    FocusScope.of(context).unfocus();
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
      // Straight to /home — the router gate takes over from here (new users are
      // sent to profile setup, returning users land on Home).
      success: (_) => context.go('/home'),
      failure: (f) {
        setState(() {
          _loading = false;
          _error = f.message;
          _code.clear();
        });
        _shake.forward(from: 0);
        _focus.requestFocus();
      },
    );
  }

  Future<void> _resend() async {
    if (_seconds > 0 || _loading) return;
    setState(() {
      _error = null;
      _code.clear();
    });
    await ref.read(authControllerProvider).startPhoneVerification(
      e164Phone: widget.args.phone,
      resendToken: _resendToken,
      codeSent: (id, token) {
        setState(() {
          _verificationId = id;
          _resendToken = token;
        });
        _startCountdown();
        _focus.requestFocus();
      },
      // Android may instant-verify without a visible code — treat it as success.
      onAutoVerified: (_) {
        if (mounted) context.go('/home');
      },
      onError: (f) => setState(() => _error = f.message),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _shake.dispose();
    _focus.dispose();
    _code.dispose();
    super.dispose();
  }

  // Pretty-print +91XXXXXXXXXX as +91 XXXXX XXXXX for the "sent to" line.
  String get _prettyPhone {
    final p = widget.args.phone;
    if (p.startsWith('+91') && p.length == 13) {
      return '+91 ${p.substring(3, 8)} ${p.substring(8)}';
    }
    return p;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Ob.bgColor,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Same celestial background as Login / onboarding, so verification
          // feels like one continuous branded flow.
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
              child: Image.asset(Ob.sceneryBase, fit: BoxFit.fitWidth, alignment: Alignment.bottomCenter),
            ),
          ),
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 12, 24, 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: IconButton(
                      onPressed: () => context.pop(),
                      icon: const Icon(Icons.arrow_back_rounded, color: Ob.navy),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                  ),
                  const SizedBox(height: 10),
                  const AppLogo(height: 50),
                  const SizedBox(height: 26),
                  Text('Verify your number', style: Ob.title),
                  const SizedBox(height: 14),
                  const SparkleDivider(),
                  const SizedBox(height: 16),
                  Text.rich(
                    TextSpan(
                      style: Ob.subtitle,
                      children: [
                        const TextSpan(text: 'Enter the 6-digit code sent to\n'),
                        TextSpan(
                          text: _prettyPhone,
                          style: Ob.subtitle.copyWith(color: Ob.navy, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 6),
                  TextButton(
                    onPressed: _loading ? null : () => context.pop(),
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      minimumSize: const Size(0, 32),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: Text('Wrong number? Change',
                        style: Ob.note.copyWith(color: Ob.purple, fontWeight: FontWeight.w600),),
                  ),
                  const SizedBox(height: 22),
                  _codeField(),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: Ob.note.copyWith(color: const Color(0xFFD25360))),
                  ],
                  const SizedBox(height: 26),
                  GoldButton(
                    label: _loading ? 'Verifying…' : 'Verify',
                    icon: _loading ? null : Icons.check_rounded,
                    loading: _loading,
                    onPressed: _loading ? null : _verify,
                  ),
                  const SizedBox(height: 18),
                  Center(
                    child: _seconds > 0
                        ? Text('Resend code in 00:${_seconds.toString().padLeft(2, '0')}',
                            style: Ob.note,)
                        : TextButton(
                            onPressed: _resend,
                            child: Text('Resend code',
                                style: Ob.note.copyWith(
                                    color: Ob.purple, fontWeight: FontWeight.w600,),),
                          ),
                  ),
                  const SizedBox(height: 18),
                  const Center(child: SecureFooter()),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _codeField() {
    return AnimatedBuilder(
      animation: _shake,
      builder: (context, child) {
        // Damped left-right wobble: three cycles, fading out over the animation.
        final t = _shake.value;
        final dx = t == 0 ? 0.0 : 8 * (1 - t) * math.sin(t * 3 * 2 * math.pi);
        return Transform.translate(offset: Offset(dx, 0), child: child);
      },
      child: GestureDetector(
        onTap: () => _focus.requestFocus(),
        behavior: HitTestBehavior.opaque,
        child: Stack(
          children: [
            Row(
              children: List.generate(
                _len,
                (i) => Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(right: i == _len - 1 ? 0 : 10),
                    child: _cell(i),
                  ),
                ),
              ),
            ),
            // Transparent field on top capturing the actual input + OS SMS
            // auto-fill; the cells above are purely the visual.
            Positioned.fill(
              child: Opacity(
                opacity: 0,
                child: TextField(
                  controller: _code,
                  focusNode: _focus,
                  keyboardType: TextInputType.number,
                  maxLength: _len,
                  autofillHints: const [AutofillHints.oneTimeCode],
                  enableInteractiveSelection: false,
                  showCursor: false,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  onChanged: _onChanged,
                  decoration: const InputDecoration(counterText: '', border: InputBorder.none),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _cell(int i) {
    final code = _code.text;
    final filled = i < code.length;
    final isNext = i == code.length && _focus.hasFocus && _error == null;
    final hasError = _error != null;
    return Container(
      height: 56,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Ob.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: hasError
              ? const Color(0xFFE39BA3)
              : isNext
                  ? Ob.purple
                  : filled
                      ? Ob.gold
                      : Ob.border,
          width: (isNext || filled) ? 1.8 : 1.2,
        ),
        boxShadow: Ob.softShadow,
      ),
      child: Text(
        filled ? code[i] : '',
        style: Ob.title.copyWith(fontSize: 26, color: Ob.navy),
      ),
    );
  }
}
