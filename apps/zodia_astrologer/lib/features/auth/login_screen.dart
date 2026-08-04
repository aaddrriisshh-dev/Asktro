import 'dart:math' as math;

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/providers.dart';
import '../../ui/celestial.dart';

/// Astrologer login: email + password only. Astrologers are staff — their
/// accounts are created by the Zodia admin portal — so there is no phone/OTP
/// sign-in. Approval gating happens on the dashboard once the profile loads.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  static const _zodiac = 'assets/onboarding/zodiac_wheel.png';
  static const _wordmark = 'assets/onboarding/logo_wordmark.webp';

  final _email = TextEditingController();
  final _password = TextEditingController();

  bool _loading = false;
  bool _obscure = true;
  String? _error;

  Future<void> _loginEmail() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Enter your email and password.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref
          .read(firebaseAuthProvider)
          .signInWithEmailAndPassword(email: _email.text.trim(), password: _password.text);
    } on FirebaseAuthException catch (e) {
      setState(() {
        _loading = false;
        _error = (e.code == 'invalid-credential' || e.code == 'wrong-password' || e.code == 'user-not-found')
            ? 'Incorrect email or password.'
            : (e.message ?? 'Sign-in failed');
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = 'Sign-in failed. Please try again.';
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
                  colors: [Color(0xFFFFFFFF), Color(0xFFFFFDF7), Color(0xFFEDE7FB)],
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
            child: const Icon(Icons.auto_awesome, color: Color(0xFFFFD98A), size: 16),
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
                      color: const Color(0xFF1A150C),
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
                      Text('Use the credentials provided by the Zodia team.',
                          style: Sky.label.copyWith(fontSize: 13),),
                      const SizedBox(height: 18),
                      TextField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        style: Sky.body,
                        decoration: _dec('Email', Icons.mail_outline_rounded),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _password,
                        obscureText: _obscure,
                        style: Sky.body,
                        onSubmitted: (_) => _loading ? null : _loginEmail(),
                        decoration: _dec('Password', Icons.lock_outline_rounded).copyWith(
                          suffixIcon: IconButton(
                            icon: Icon(_obscure ? Icons.visibility_off_rounded : Icons.visibility_rounded,
                                size: 20, color: Sky.ink2,),
                            onPressed: () => setState(() => _obscure = !_obscure),
                          ),
                        ),
                      ),
                      const SizedBox(height: 22),
                      GoldButton(
                        label: 'Sign in',
                        icon: Icons.arrow_forward_rounded,
                        loading: _loading,
                        onPressed: _loading ? null : _loginEmail,
                      ),
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
                  child: Text('Zodia Tech Private Limited',
                      style: Sky.label.copyWith(fontSize: 11, color: Sky.ink3),),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  InputDecoration _dec(String hint, IconData icon) => InputDecoration(
        hintText: hint,
        hintStyle: Sky.label.copyWith(fontSize: 14, color: Sky.ink3),
        prefixIcon: Icon(icon, size: 20, color: Sky.ink2),
        filled: true,
        fillColor: Sky.surface,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
        contentPadding: const EdgeInsets.symmetric(vertical: 16),
      );
}
