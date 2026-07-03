'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { user, isAdmin, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user && isAdmin) router.replace('/');
  }, [loading, user, isAdmin, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const token = await cred.user.getIdTokenResult(true);
      if (token.claims.role !== 'admin') {
        setError('This account does not have admin access.');
        await auth.signOut();
      } else {
        router.replace('/');
      }
    } catch {
      setError('Invalid email or password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="celestial">
      {/* temple scenery grounded along the bottom — the ASKTRO celestial look */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="celestial__scenery" src="/brand/scenery.webp" alt="" />

      <div className="celestial__inner">
        {/* Left: brand panel with the zodiac wheel as a subtle backdrop */}
        <div className="celestial__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="celestial__brand-wheel" src="/brand/zodiac_wheel.png" alt="" />
          <div className="celestial__brand-content">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="celestial__brand-logo" src="/brand/asktro_logo.png" alt="Asktro" />
            <h2 className="celestial__brand-title">
              Guidance,<br />
              <span>written in the stars.</span>
            </h2>
            <p className="celestial__brand-text">
              The ASKTRO operations console — manage astrologers, wallets, payouts,
              coupons and the whole celestial marketplace from one place.
            </p>
            <div className="celestial__feature">Approve &amp; manage astrologers</div>
            <div className="celestial__feature">Wallets, recharges &amp; payouts</div>
            <div className="celestial__feature">Live platform analytics</div>
          </div>
        </div>

        {/* Right: sign-in card */}
        <form onSubmit={submit} className="celestial__card">
          <p className="celestial__eyebrow">Operations Console</p>
          <h1 className="celestial__title">Welcome back</h1>
          <p className="celestial__subtitle">Sign in to continue.</p>

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
          <button className="btn" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
