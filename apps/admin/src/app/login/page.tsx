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
      {/* zodiac wheels tucked into both top corners + temple scenery at the base */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="celestial__wheel celestial__wheel--left" src="/brand/zodiac_wheel.png" alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="celestial__wheel" src="/brand/zodiac_wheel.png" alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="celestial__scenery" src="/brand/scenery.webp" alt="" />

      <form onSubmit={submit} className="celestial__card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="celestial__logo" src="/brand/asktro_logo.png" alt="Asktro" />
        <p className="celestial__eyebrow">Operations Console</p>
        <h1 className="celestial__title">Welcome back</h1>
        <p className="celestial__subtitle">Sign in to manage the ASKTRO platform.</p>

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
  );
}
