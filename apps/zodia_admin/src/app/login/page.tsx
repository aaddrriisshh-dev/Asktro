'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword, sendPasswordResetEmail,
  getMultiFactorResolver, TotpMultiFactorGenerator,
  type MultiFactorResolver, type MultiFactorError, type UserCredential,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { user, isAdmin, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Second-factor (TOTP) challenge state — only set when the account has enrolled
  // 2FA, so accounts without it sign in exactly as before.
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  useEffect(() => {
    if (!loading && user && isAdmin) router.replace('/');
  }, [loading, user, isAdmin, router]);

  async function forgotPassword() {
    setInfo(null);
    setError(null);
    if (!email.trim()) {
      setError('Enter your email above first, then tap “Forgot password?”.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo('Password reset link sent — check your email (and spam).');
    } catch {
      setError('Could not send a reset link. Check the email address.');
    }
  }

  /** After any successful sign-in (password-only or after the 2FA step), confirm
   *  the admin claim and route in — or bounce a non-admin. */
  async function finishSignIn(cred: UserCredential) {
    const token = await cred.user.getIdTokenResult(true);
    if (token.claims.role !== 'admin') {
      setError('This account does not have admin access.');
      await auth.signOut();
    } else {
      router.replace('/');
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await finishSignIn(cred);
    } catch (err) {
      const code = (err as { code?: string }).code;
      // The account has 2FA enrolled — switch to the authenticator-code step
      // instead of failing. (Accounts without 2FA never hit this branch.)
      if (code === 'auth/multi-factor-auth-required') {
        setMfaResolver(getMultiFactorResolver(auth, err as MultiFactorError));
        setError(null);
      } else {
        setError('Invalid email or password.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaResolver) return;
    setBusy(true);
    setError(null);
    try {
      // The enrolled TOTP factor for this account.
      const factor = mfaResolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID)
        ?? mfaResolver.hints[0];
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(factor.uid, mfaCode.trim());
      const cred = await mfaResolver.resolveSignIn(assertion);
      await finishSignIn(cred);
    } catch {
      setError('That code didn’t match. Check your authenticator app and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="celestial">
      {/* zodiac wheels tucked into both top corners + temple scenery at the base */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="celestial__wheel celestial__wheel--left" src="/brand/zodiac_wheel.png" alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="celestial__wheel" src="/brand/zodiac_wheel.png" alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="celestial__scenery" src="/brand/scenery.webp" alt="" />

      <form onSubmit={mfaResolver ? submitMfa : submit} className="celestial__card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="celestial__logo" src="/brand/asktro_logo.png" alt="Zodia" />
        <p className="celestial__eyebrow">Operations Console</p>

        {mfaResolver ? (
          <>
            <h1 className="celestial__title">Two-factor</h1>
            <p className="celestial__subtitle">Enter the 6-digit code from your authenticator app.</p>
            <label className="celestial__label">Authentication code</label>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{ margin: '6px 0 16px', letterSpacing: '0.3em', textAlign: 'center' }}
              autoFocus
              required
            />
            {error && <p style={{ color: 'var(--error)', fontSize: 14, marginTop: 0 }}>{error}</p>}
            <button className="btn" style={{ width: '100%' }} disabled={busy || mfaCode.length < 6}>
              {busy ? 'Verifying…' : 'Verify & sign in'}
            </button>
            <button type="button" className="celestial__forgot" onClick={() => { setMfaResolver(null); setMfaCode(''); setError(null); }}>
              ← Back
            </button>
          </>
        ) : (
          <>
            <h1 className="celestial__title">Welcome back</h1>
            <p className="celestial__subtitle">Sign in to manage the ZODIA platform.</p>

            <label className="celestial__label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ margin: '6px 0 14px' }}
              required
            />
            <label className="celestial__label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ margin: '6px 0 16px' }}
              required
            />
            {error && <p style={{ color: 'var(--error)', fontSize: 14, marginTop: 0 }}>{error}</p>}
            {info && <p style={{ color: 'var(--primary)', fontSize: 14, marginTop: 0 }}>{info}</p>}
            <button className="btn" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" className="celestial__forgot" onClick={forgotPassword}>
              Forgot password?
            </button>
          </>
        )}
      </form>
    </div>
  );
}
