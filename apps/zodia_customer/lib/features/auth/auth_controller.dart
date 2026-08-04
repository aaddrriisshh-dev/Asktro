import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../app/router.dart';
import '../../data/messaging_service.dart';

/// Auth actions: phone OTP, Google, Apple. On success we ensure a `users/{uid}`
/// profile exists (money fields zeroed; the onCustomerSignup function backfills
/// the referral code). Guest login is not allowed (Part 3).
class AuthController {
  AuthController(this._auth, this._ref);
  final FirebaseAuth _auth;
  final Ref _ref;

  /// Kicks off phone verification. Calls [codeSent] with the verificationId,
  /// or [onError] with a friendly message. Android may auto-resolve via
  /// [onAutoVerified].
  Future<void> startPhoneVerification({
    required String e164Phone,
    required void Function(String verificationId, int? resendToken) codeSent,
    required void Function(Failure failure) onError,
    void Function(UserCredential cred) onAutoVerified = _noop,
    int? resendToken,
  }) async {
    await _auth.verifyPhoneNumber(
      phoneNumber: e164Phone,
      forceResendingToken: resendToken,
      verificationCompleted: (cred) async {
        final userCred = await _auth.signInWithCredential(cred);
        await _ensureProfile(userCred, phone: e164Phone);
        onAutoVerified(userCred);
      },
      verificationFailed: (e) =>
          onError(Failure(message: e.message ?? 'Verification failed', code: e.code)),
      codeSent: (id, token) => codeSent(id, token),
      codeAutoRetrievalTimeout: (_) {},
      timeout: const Duration(seconds: 60),
    );
  }

  Future<Result<void>> confirmOtp({
    required String verificationId,
    required String smsCode,
    required String phone,
  }) async {
    try {
      final cred = PhoneAuthProvider.credential(verificationId: verificationId, smsCode: smsCode);
      final userCred = await _auth.signInWithCredential(cred);
      await _ensureProfile(userCred, phone: phone);
      return const Success(null);
    } on FirebaseAuthException catch (e) {
      final msg = e.code == 'invalid-verification-code'
          ? 'That code is incorrect. Please try again.'
          : (e.message ?? 'Verification failed');
      return ResultFailure(Failure(message: msg, code: e.code));
    } catch (e) {
      return ResultFailure(Failure.unknown(e));
    }
  }

  Future<Result<void>> signInWithGoogle() async {
    try {
      final googleUser = await GoogleSignIn().signIn();
      if (googleUser == null) return const ResultFailure(Failure(message: 'Sign-in cancelled'));
      final googleAuth = await googleUser.authentication;
      final cred = GoogleAuthProvider.credential(
        idToken: googleAuth.idToken,
        accessToken: googleAuth.accessToken,
      );
      final userCred = await _auth.signInWithCredential(cred);
      await _ensureProfile(userCred, phone: userCred.user?.phoneNumber ?? '');
      return const Success(null);
    } catch (e) {
      return ResultFailure(Failure.unknown(e));
    }
  }

  Future<Result<void>> signInWithApple() async {
    try {
      final apple = await SignInWithApple.getAppleIDCredential(
        scopes: [AppleIDAuthorizationScopes.email, AppleIDAuthorizationScopes.fullName],
      );
      final oauth = OAuthProvider('apple.com').credential(
        idToken: apple.identityToken,
        accessToken: apple.authorizationCode,
      );
      final userCred = await _auth.signInWithCredential(oauth);
      final name = [apple.givenName, apple.familyName].whereType<String>().join(' ').trim();
      await _ensureProfile(userCred, phone: '', name: name.isEmpty ? null : name, email: apple.email);
      return const Success(null);
    } catch (e) {
      return ResultFailure(Failure.unknown(e));
    }
  }

  Future<void> signOut() async {
    // Also clear the cached Google session — otherwise Firebase signs out but
    // Google keeps the account cached, so the next "Continue with Google"
    // silently re-picks the same account (the user can't switch, and a shared
    // device leaks the last account).
    try { await GoogleSignIn().signOut(); } catch (_) {/* not signed in via Google */}
    await _auth.signOut();
  }

  Future<void> _ensureProfile(UserCredential cred, {required String phone, String? name, String? email}) async {
    final uid = cred.user?.uid;
    if (uid == null) return;
    // Onboarding details collected before login (buffered in memory, and on disk
    // so they survive an app restart during the OTP step). Written together with
    // the profile in a single create — no separate flush, no race.
    final pending = _ref.read(pendingProfileProvider) ?? await readPendingProfile();
    await _ref.read(userRepositoryProvider).ensureProfile(
          uid,
          phone: phone,
          name: name ?? cred.user?.displayName,
          email: email ?? cred.user?.email,
          profile: pending,
        );
    // Deliberately DO NOT clear the buffer here. If this create silently didn't
    // land the details (offline write that never synced, trigger/create race,
    // or the doc pre-existed as a bare 'Guest'), clearing now would lose the only
    // copy. The home gate re-applies the buffer against the profile on first
    // arrival at /home and clears it only after that write succeeds.
    _ref.read(analyticsProvider).logEvent(AnalyticsEvents.login);
  }

  static void _noop(UserCredential _) {}
}

final authControllerProvider = Provider<AuthController>(
  (ref) => AuthController(ref.watch(firebaseAuthProvider), ref),
);
