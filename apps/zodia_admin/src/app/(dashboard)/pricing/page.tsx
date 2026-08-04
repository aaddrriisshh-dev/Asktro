'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
  freeChatMinutes: number;
  graceMinutes: number;
}

const DEFAULTS: Config = {
  consultationPricePerMinutePaise: 900,
  minWalletToStartPaise: 1800,
  warnLevel1Sec: 60,
  warnLevel2Sec: 20,
  reconnectTimeoutSec: 45,
  sessionTimeoutSec: 300,
  requestTimeoutSec: 30,
  commissionPercent: 20,
  freeChatMinutes: 3,
  graceMinutes: 1,
};

export default function PricingPage() {
  const { adminRole } = useAuth();
  const editable = canEdit(adminRole, '/pricing');
  const [cfg, setCfg] = useState<Config>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'config', 'global')).then((s) => {
      if (s.exists()) setCfg({ ...DEFAULTS, ...(s.data() as Partial<Config>) });
      setLoading(false);
    });
  }, []);

  async function save() {
    if (!editable) return;
    await setDoc(doc(db, 'config', 'global'), { ...cfg, updatedAt: serverTimestamp() }, { merge: true });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function num(k: keyof Config, v: string) {
    setCfg((c) => ({ ...c, [k]: Number(v) || 0 }));
  }

  if (loading) return <p className="muted">Loading…</p>;

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
        <Field label="Price per minute (₹)"
          value={String(cfg.consultationPricePerMinutePaise / 100)}
          onChange={(v) => setCfg((c) => ({ ...c, consultationPricePerMinutePaise: rupeesToPaise(Number(v)) }))} />
        <Field label="Minimum wallet to start (₹)"
          value={String(cfg.minWalletToStartPaise / 100)}
          onChange={(v) => setCfg((c) => ({ ...c, minWalletToStartPaise: rupeesToPaise(Number(v)) }))} />
        <Field label="Free chat minutes (new user)" value={String(cfg.freeChatMinutes)} onChange={(v) => num('freeChatMinutes', v)} />
        <Field label="Grace minutes (at zero balance)" value={String(cfg.graceMinutes)} onChange={(v) => num('graceMinutes', v)} />
        <Field label="Low-balance warning (sec left)" value={String(cfg.warnLevel1Sec)} onChange={(v) => num('warnLevel1Sec', v)} />
        <Field label="Final warning (sec left)" value={String(cfg.warnLevel2Sec)} onChange={(v) => num('warnLevel2Sec', v)} />
        <Field label="Reconnect timeout (sec)" value={String(cfg.reconnectTimeoutSec)} onChange={(v) => num('reconnectTimeoutSec', v)} />
        <Field label="Session timeout (sec)" value={String(cfg.sessionTimeoutSec)} onChange={(v) => num('sessionTimeoutSec', v)} />
        <Field label="Request timeout (sec)" value={String(cfg.requestTimeoutSec)} onChange={(v) => num('requestTimeoutSec', v)} />
        <Field label="Commission (%)" value={String(cfg.commissionPercent)} onChange={(v) => num('commissionPercent', v)} />
      </fieldset>
      {editable && (
        <div style={{ marginTop: 16 }}>
          <button className="btn" onClick={save}>Save settings</button>
          {saved && <span style={{ marginLeft: 12, color: 'var(--success)' }}>Saved ✓</span>}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="muted" style={{ fontSize: 13 }}>{label}</span>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} style={{ marginTop: 4 }} />
    </label>
  );
}
