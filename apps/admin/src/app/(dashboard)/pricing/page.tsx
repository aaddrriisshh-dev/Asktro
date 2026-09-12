'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { rupeesToPaise } from '@/lib/format';
import { useAuth } from '@/lib/auth-context';
import { canEdit } from '@/lib/roles';

interface Config {
  consultationPricePerMinutePaise: number;
  minWalletToStartPaise: number;
  warnLevel1Sec: number;
  warnLevel2Sec: number;
  reconnectTimeoutSec: number;
  sessionTimeoutSec: number;
  requestTimeoutSec: number;
  commissionPercent: number;
  welcomeCreditPaise: number;
  graceMinutes: number;
}

// Safety ceiling on the one-time welcome gift, mirrored server-side in
// onUserCreate — a typo here can never mint a huge free credit.
const WELCOME_CREDIT_MAX_PAISE = 50000; // ₹500

const DEFAULTS: Config = {
  consultationPricePerMinutePaise: 900,
  minWalletToStartPaise: 1800,
  warnLevel1Sec: 60,
  warnLevel2Sec: 20,
  reconnectTimeoutSec: 45,
  sessionTimeoutSec: 300,
  requestTimeoutSec: 30,
  commissionPercent: 20,
  welcomeCreditPaise: 0,
  graceMinutes: 1,
};

export default function PricingPage() {
  const { adminRole, user } = useAuth();
  const editable = canEdit(adminRole, '/pricing');
  const [cfg, setCfg] = useState<Config>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  // Super-admin password gate: any pricing change must be re-confirmed with the
  // admin's own portal password (verified by Firebase — no secret is stored).
  const [confirming, setConfirming] = useState(false);
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    getDoc(doc(db, 'config', 'global')).then((s) => {
      if (s.exists()) setCfg({ ...DEFAULTS, ...(s.data() as Partial<Config>) });
      setLoading(false);
    });
  }, []);

  async function confirmAndSave() {
    if (!editable) return;
    if (!user?.email) { setErr('Session error — please log out and back in.'); return; }
    if (!pwd) { setErr('Enter your portal password to confirm.'); return; }
    setBusy(true);
    setErr('');
    try {
      // Prove it's really you before changing platform pricing.
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pwd));
      const safe: Config = {
        ...cfg,
        welcomeCreditPaise: Math.max(0, Math.min(cfg.welcomeCreditPaise, WELCOME_CREDIT_MAX_PAISE)),
      };
      await setDoc(doc(db, 'config', 'global'), { ...safe, updatedAt: serverTimestamp() }, { merge: true });
      setCfg(safe);
      setSaved(true);
      setConfirming(false);
      setPwd('');
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      const msg = (e as Error).message || '';
      if (msg.includes('wrong-password') || msg.includes('invalid-credential') || msg.includes('invalid-login')) {
        setErr('Your portal password is incorrect. Nothing was changed.');
      } else {
        setErr('Could not save: ' + msg);
      }
    } finally {
      setBusy(false);
    }
  }

  function num(k: keyof Config, v: string) {
    setCfg((c) => ({ ...c, [k]: Number(v) || 0 }));
  }

  if (loading) return <p className="muted">Loading…</p>;

  const creditRupees = cfg.welcomeCreditPaise / 100;
  const perMinRupees = cfg.consultationPricePerMinutePaise / 100;
  // A friendly, live example so the ₹ gift is instantly understandable.
  const exampleMinutes = perMinRupees > 0 ? (creditRupees / perMinRupees) : 0;

  return (
    <div>
      <h1>Pricing & Settings</h1>
      <p className="muted">Changes apply platform-wide instantly — no app update required.</p>
      {!editable && (
        <div className="card" style={{ borderLeft: '4px solid var(--gold)', marginBottom: 14 }}>
          <strong>View only.</strong> <span className="muted">Your role can see these settings but not change them — a Super Admin manages pricing.</span>
        </div>
      )}
      <fieldset disabled={!editable} className="card grid" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 700, opacity: editable ? 1 : 0.7, border: 'none' }}>
        <Field label="Base price per minute (₹)"
          hint="Fallback rate. Each astrologer's own ₹/min is set on their profile."
          value={String(perMinRupees)}
          onChange={(v) => setCfg((c) => ({ ...c, consultationPricePerMinutePaise: rupeesToPaise(Number(v)) }))} />
        <Field label="Minimum wallet to start (₹)"
          hint="Minimum balance a user needs to begin a paid consult."
          value={String(cfg.minWalletToStartPaise / 100)}
          onChange={(v) => setCfg((c) => ({ ...c, minWalletToStartPaise: rupeesToPaise(Number(v)) }))} />
        <Field label="Free welcome credit for new users (₹)"
          hint={
            creditRupees > 0
              ? `One-time gift. Buys free minutes at each astrologer's rate — e.g. ₹${creditRupees} ÷ ₹${perMinRupees}/min ≈ ${exampleMinutes.toFixed(1)} min. Set 0 to turn off. Max ₹500.`
              : 'One-time gift for new users. Set 0 = no free credit. Buys free minutes at each astrologer’s rate. Max ₹500.'
          }
          value={String(creditRupees)}
          onChange={(v) => setCfg((c) => ({ ...c, welcomeCreditPaise: rupeesToPaise(Number(v)) }))} />
        <Field label="Grace minutes (at zero balance)" value={String(cfg.graceMinutes)} onChange={(v) => num('graceMinutes', v)} />
        <Field label="Low-balance warning (sec left)" value={String(cfg.warnLevel1Sec)} onChange={(v) => num('warnLevel1Sec', v)} />
        <Field label="Final warning (sec left)" value={String(cfg.warnLevel2Sec)} onChange={(v) => num('warnLevel2Sec', v)} />
        <Field label="Reconnect timeout (sec)" value={String(cfg.reconnectTimeoutSec)} onChange={(v) => num('reconnectTimeoutSec', v)} />
        <Field label="Session timeout (sec)" value={String(cfg.sessionTimeoutSec)} onChange={(v) => num('sessionTimeoutSec', v)} />
        <Field label="Request timeout (sec)" value={String(cfg.requestTimeoutSec)} onChange={(v) => num('requestTimeoutSec', v)} />
        <Field label="Commission (%)" value={String(cfg.commissionPercent)} onChange={(v) => num('commissionPercent', v)} />
      </fieldset>

      {editable && !confirming && (
        <div style={{ marginTop: 16 }}>
          <button className="btn" onClick={() => { setErr(''); setConfirming(true); }}>Save settings</button>
          {saved && <span style={{ marginLeft: 12, color: 'var(--success)' }}>Saved ✓</span>}
        </div>
      )}

      {editable && confirming && (
        <div className="card" style={{ marginTop: 16, maxWidth: 420 }}>
          <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Confirm pricing change</p>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Enter your own portal password to apply these changes.
          </p>
          <input
            className="input"
            type="password"
            placeholder="Your admin password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmAndSave(); }}
            style={{ marginBottom: 10 }}
          />
          {err && <p style={{ color: 'var(--danger, #d33)', fontSize: 13, margin: '0 0 10px' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" disabled={busy} onClick={confirmAndSave}>{busy ? 'Saving…' : 'Confirm & Save'}</button>
            <button className="btn secondary" disabled={busy} onClick={() => { setConfirming(false); setPwd(''); setErr(''); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="muted" style={{ fontSize: 13 }}>{label}</span>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} style={{ marginTop: 4 }} />
      {hint && <span className="muted" style={{ fontSize: 11.5, display: 'block', marginTop: 4, lineHeight: 1.35 }}>{hint}</span>}
    </label>
  );
}
