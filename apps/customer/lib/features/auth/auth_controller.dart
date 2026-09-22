import 'package:cloud_functions/cloud_functions.dart' show FirebaseFunctionsException;
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
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
      // Android auto-retrieves the SMS code and fires this a split-second after
      // sign-in. Everything here can fail on a real device (invalid auto code,
      // token not yet propagated → Firestore permission-denied, transient
      // "unavailable"); without this guard those became fatal crashes on the
      // signup path. Route any failure to onError so the user just sees a
      // message and can retry, exactly like the manual code path.
      verificationCompleted: (cred) async {
        try {
          final userCred = await _auth.signInWithCredential(cred);
          await _ensureProfile(userCred, phone: e164Phone);
          onAutoVerified(userCred);
        } on FirebaseAuthException catch (e) {
          onError(Failure(message: e.message ?? 'Verification failed', code: e.code));
        } catch (e) {
          onError(Failure.unknown(e));
        }
      },
      verificationFailed: (e) =>
          onError(Failure(message: e.message ?? 'Verification failed', code: e.code)),
      codeSent: (id, token) => codeSent(id, token),
      codeAutoRetrievalTimeout: (_) {},
      timeout: const Duration(seconds: 60),
    );
  }

  /// Send the login OTP over WhatsApp (cheap primary path). Returns true if the
  /// backend accepted the send; false on ANY problem — the caller then falls back
  /// to [startPhoneVerification] (Firebase SMS), so a number with no WhatsApp is
  /// never blocked. Never throws.
  Future<bool> sendWhatsappOtp(String e164Phone) async {
    try {
      final res = await _ref
          .read(functionsProvider)
          .httpsCallable('sendWhatsappOtp')
          .call<dynamic>({'phone': e164Phone});
      final data = res.data;
      return data is Map && data['ok'] == true;
    } catch (_) {
      return false; // fall back to Firebase SMS
    }
  }

  /// Verify a WhatsApp OTP: the backend checks the code and returns a Firebase
  /// custom token (reusing the existing uid for this phone), which we sign in with.
  Future<Result<void>> verifyWhatsappOtp({
    required String e164Phone,
    required String code,
  }) async {
    try {
      final res = await _ref
          .read(functionsProvider)
          .httpsCallable('verifyWhatsappOtp')
          .call<dynamic>({'phone': e164Phone, 'code': code});
      final data = res.data;
      final token = (data is Map ? data['token'] : null) as String?;
      if (token == null || token.isEmpty) {
        return const ResultFailure(Failure(message: 'Verification failed. Please try again.'));
      }
      final userCred = await _auth.signInWithCustomToken(token);
      await _ensureProfile(userCred, phone: e164Phone);
      return const Success(null);
    } on FirebaseFunctionsException catch (e) {
      return ResultFailure(Failure(message: e.message ?? 'Verification failed', code: e.code));
    } catch (e) {
      return ResultFailure(Failure.unknown(e));
    }
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
    // Make sure the freshly-minted auth token is available to the Firestore
    // client before the first profile write (ensureProfile also retries). On the
    // fast auto-verify path the write could otherwise fire before the token
    // propagated and be rejected as permission-denied. Best-effort.
    try {
      await cred.user?.getIdToken();
    } catch (_) {/* non-fatal; the write retry covers a slow token */}
    // Guarantee a base account doc exists (money fields zeroed; onCustomerSignup
    // backfills the referral code + welcome bonus). The astrology DETAILS are no
    // longer collected before login — profile setup runs AFTER sign-in and writes
    // them straight to this uid, gated by the router until the essentials exist.
    // So there is no pre-login buffer to hand off and no hand-off race.
    await _ref.read(userRepositoryProvider).ensureProfile(
          uid,
          phone: phone,
          name: name ?? cred.user?.displayName,
          email: email ?? cred.user?.email,
        );
    _ref.read(analyticsProvider).logEvent(AnalyticsEvents.login);
  }

  static void _noop(UserCredential _) {}
}

final authControllerProvider = Provider<AuthController>(
  (ref) => AuthController(ref.watch(firebaseAuthProvider), ref),
);
