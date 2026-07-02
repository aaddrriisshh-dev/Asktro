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
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <form onSubmit={submit} className="card" style={{ width: 380, maxWidth: '100%' }}>
        <h1 style={{ marginTop: 0, color: 'var(--primary)' }}>ASKTRO Admin</h1>
        <p className="muted" style={{ marginTop: -8 }}>Sign in to the operations console.</p>
        <label>Email</label>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ margin: '6px 0 14px' }}
          required
        />
        <label>Password</label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ margin: '6px 0 14px' }}
          required
        />
        {error && <p style={{ color: 'var(--error)', fontSize: 14 }}>{error}</p>}
        <button className="btn" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
