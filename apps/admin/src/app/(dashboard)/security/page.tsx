'use client';

import { useState } from 'react';
import {
  multiFactor, TotpMultiFactorGenerator, EmailAuthProvider, reauthenticateWithCredential,
  type TotpSecret, type MultiFactorInfo,
} from 'firebase/auth';
import { useAuth } from '@/lib/auth-context';

/**
 * Per-admin two-factor (TOTP) management. Firebase MFA is per-user opt-in — an
 * account without an enrolled factor signs in with just a password, so enabling
 * this here never locks anyone else out. Enroll your own account first, confirm
 * you can sign in with the code, then ask the rest of the team to do the same.
 */
export default function SecurityPage() {
  const { user } = useAuth();
  const [factors, setFactors] = useState<MultiFactorInfo[]>(user ? multiFactor(user).enrolledFactors : []);
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [needReauth, setNeedReauth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!user) return <div><p>Loading…</p></div>;

  const refresh = () => setFactors(multiFactor(user).enrolledFactors);

  /** Re-authenticate with the password (MFA changes need a fresh login). */
  async function reauth(): Promise<boolean> {
    if (!user?.email) return false;
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      setNeedReauth(false);
      setPassword('');
      return true;
    } catch {
      setErr('Password didn’t match. Try again.');
      return false;
    }
  }

  async function begin() {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const session = await multiFactor(user!).getSession();
      const s = await TotpMultiFactorGenerator.generateSecret(session);
      setSecret(s);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/requires-recent-login') {
        setNeedReauth(true);
        setErr('For your security, confirm your password to change 2FA.');
      } else if (code === 'auth/unverified-email') {
        setErr('This admin email isn’t verified yet — ask the owner to re-run the admin seed (it marks emails verified), then reload.');
      } else {
        setErr('Could not start 2FA setup. Make sure MFA is enabled for the project.');
      }
    } finally { setBusy(false); }
  }

  async function enroll() {
    if (!secret) return;
    setErr(null); setBusy(true);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code.trim());
      await multiFactor(user!).enroll(assertion, 'Authenticator app');
      setSecret(null); setCode('');
      setMsg('✅ Two-factor is now ON for your account. You’ll be asked for a code next sign-in.');
      refresh();
    } catch {
      setErr('That code didn’t match. Check your authenticator app’s current 6-digit code and try again.');
    } finally { setBusy(false); }
  }

  async function unenroll(f: MultiFactorInfo) {
    if (!confirm('Turn OFF two-factor for your account?')) return;
    setErr(null); setBusy(true);
    try {
      await multiFactor(user!).unenroll(f);
      setMsg('Two-factor removed.');
      refresh();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/requires-recent-login') { setNeedReauth(true); setErr('Confirm your password to remove 2FA.'); }
      else setErr('Could not remove 2FA.');
    } finally { setBusy(false); }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ marginBottom: 2 }}>🔒 Security · Two-factor authentication</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        Signed in as <strong>{user.email}</strong>. 2FA protects the portal even if your password is stolen.
      </p>

      {msg && <p style={{ color: 'var(--primary)', marginTop: 12 }}>{msg}</p>}
      {err && <p style={{ color: 'var(--error)', marginTop: 12 }}>{err}</p>}

      {needReauth && (
        <div className="card" style={{ marginTop: 16, padding: 16 }}>
          <p style={{ marginTop: 0 }}>Confirm your password</p>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Current password" />
          <button className="btn sm" style={{ marginTop: 10 }} disabled={busy || !password} onClick={reauth}>Confirm</button>
        </div>
      )}

      {/* Current status */}
      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        {factors.length > 0 ? (
          <>
            <p style={{ marginTop: 0, fontWeight: 700, color: 'var(--primary)' }}>✅ Two-factor is ON</p>
            {factors.map((f) => (
              <div key={f.uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span className="muted">{f.displayName || 'Authenticator app'}</span>
                <button className="btn sm secondary" disabled={busy} onClick={() => unenroll(f)}>Turn off</button>
              </div>
            ))}
          </>
        ) : secret ? (
          <>
            <p style={{ marginTop: 0, fontWeight: 700 }}>Add it to your authenticator app</p>
            <ol className="muted" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Open Google Authenticator / Authy / 1Password.</li>
              <li>Add an account → <strong>Enter a setup key</strong> (manual entry).</li>
              <li>Account: <code>{user.email}</code> · Issuer: <code>Asktro Admin</code></li>
              <li>Paste this key:</li>
            </ol>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 14px' }}>
              <code style={{ fontSize: 15, letterSpacing: 1, background: 'var(--surface-2, #f3f0fa)', padding: '8px 12px', borderRadius: 8, wordBreak: 'break-all' }}>{secret.secretKey}</code>
              <button className="btn sm secondary" type="button" onClick={() => { navigator.clipboard?.writeText(secret.secretKey); setMsg('Key copied.'); }}>Copy</button>
            </div>
            <label className="celestial__label">Enter the 6-digit code it shows</label>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{ margin: '6px 0 12px', letterSpacing: '0.3em', textAlign: 'center', maxWidth: 200 }}
              placeholder="000000"
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" disabled={busy || code.length < 6} onClick={enroll}>Turn on 2FA</button>
              <button className="btn secondary" disabled={busy} onClick={() => { setSecret(null); setCode(''); }}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>Two-factor is <strong>off</strong> for your account.</p>
            <button className="btn" disabled={busy} onClick={begin}>{busy ? 'Starting…' : 'Enable two-factor'}</button>
          </>
        )}
      </div>
    </div>
  );
}
